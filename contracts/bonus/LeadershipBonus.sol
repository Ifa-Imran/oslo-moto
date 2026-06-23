// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IReferralRegistry.sol";
import "../interfaces/IOsloDEX.sol";
import "../interfaces/IOsloToken.sol";
import "../interfaces/IInvestmentEngine.sol";
import "../interfaces/IRewardVault.sol";

/// @title LeadershipBonus - Weekly Leadership Bonus System (OSLO 1-7)
/// @notice Tracks weekly team turnover with 40/60 power-leg rule and pays highest-rank-only bonus
/// @dev Volume is recorded up the referral tree on every stake. Bonus is paid in OSLO from the vault.
contract LeadershipBonus is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    /// @notice Weekly cycle duration — 1 week for mainnet
    uint256 public constant WEEKLY_CYCLE_DURATION = 1 weeks;

    IReferralRegistry public immutable referralRegistry;
    IOsloDEX public immutable osloDEX;
    IOsloToken public immutable osloToken;
    IRewardVault public immutable rewardVault;
    IInvestmentEngine public investmentEngine;

    struct RankConfig {
        uint256 requiredTurnover; // USDT 18 decimals on BSC
        uint256 bonusRateBps;     // Basis points (100 = 1%)
    }

    RankConfig[7] public ranks;

    // weekNumber = block.timestamp / WEEKLY_CYCLE_DURATION
    // Weekly volume per user
    mapping(address => mapping(uint256 => uint256)) public weeklyTotalVolume;
    // Weekly volume per user per leg (leg = direct downline root address)
    mapping(address => mapping(uint256 => mapping(address => uint256))) public weeklyLegVolume;
    // Power leg address per user per week
    mapping(address => mapping(uint256 => address)) public weeklyPowerLeg;
    // Bonus claimed tracking
    mapping(address => mapping(uint256 => bool)) public bonusClaimed;
    // Total bonus paid per user (USDT equivalent, 18 decimals)
    mapping(address => uint256) public totalBonusPaid;

    event StakeVolumeRecorded(address indexed staker, address indexed upline, address indexed legRoot, uint256 amount, uint256 week);
    event LeadershipBonusPaid(address indexed user, uint8 rank, uint256 week, uint256 bonusUSDT, uint256 osloAmount, uint256 timestamp);
    event InvestmentEngineUpdated(address indexed newEngine);

    error ZeroAddress();
    error EngineNotSet();
    error CannotClaimCurrentWeek();
    error AlreadyClaimed();
    error NoRankAchieved();
    error DEXPriceZero();

    constructor(
        address _referralRegistry,
        address _osloDEX,
        address _osloToken,
        address _rewardVault
    ) {
        if (_referralRegistry == address(0) || _osloDEX == address(0)) revert ZeroAddress();
        if (_osloToken == address(0) || _rewardVault == address(0)) revert ZeroAddress();

        referralRegistry = IReferralRegistry(_referralRegistry);
        osloDEX = IOsloDEX(_osloDEX);
        osloToken = IOsloToken(_osloToken);
        rewardVault = IRewardVault(_rewardVault);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _initRanks();
    }

    /// @notice Set the InvestmentEngine address
    function setInvestmentEngine(address _engine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_engine == address(0)) revert ZeroAddress();
        investmentEngine = IInvestmentEngine(_engine);
        emit InvestmentEngineUpdated(_engine);
    }

    /// @notice Record staking volume up the referral tree for the current week
    /// @param staker The user who staked
    /// @param amount The stake amount in USDT (18 decimals on BSC)
    function recordStakeVolume(address staker, uint256 amount) external onlyRole(ENGINE_ROLE) {
        uint256 week = block.timestamp / WEEKLY_CYCLE_DURATION;

        for (uint256 level = 1; level <= 20;) {
            address upline = referralRegistry.getUpline(staker, level);
            if (upline == address(0) || upline == address(1)) break;

            // Leg root: the staker themselves at level 1, or the upline at level-1
            address legRoot = level == 1
                ? staker
                : referralRegistry.getUpline(staker, level - 1);

            // Add volume to this upline's leg for this week
            weeklyLegVolume[upline][week][legRoot] += amount;
            weeklyTotalVolume[upline][week] += amount;

            // Update power leg if this leg now has more volume
            address currentPower = weeklyPowerLeg[upline][week];
            if (currentPower == address(0) || weeklyLegVolume[upline][week][legRoot] > weeklyLegVolume[upline][week][currentPower]) {
                weeklyPowerLeg[upline][week] = legRoot;
            }

            emit StakeVolumeRecorded(staker, upline, legRoot, amount, week);

            unchecked { ++level; }
        }
    }

    /// @notice Calculate the highest rank achieved by a user for a given week
    /// @dev Applies the 40/60 power-leg rule: max 40% of required turnover from power leg
    /// @param user The user address
    /// @param week The week number
    /// @return rank 0 = none, 1-7 = OSLO 1-7
    function calculateRank(address user, uint256 week) public view returns (uint8) {
        uint256 totalVolume = weeklyTotalVolume[user][week];
        if (totalVolume == 0) return 0;

        address powerLeg = weeklyPowerLeg[user][week];
        uint256 powerLegVolume = weeklyLegVolume[user][week][powerLeg];
        uint256 otherLegsVolume = totalVolume - powerLegVolume;

        uint8 achievedRank = 0;

        for (uint8 i = 0; i < 7;) {
            uint256 required = ranks[i].requiredTurnover;
            // Cap power leg contribution to 40% of required turnover
            uint256 maxPowerContribution = (required * 40) / 100;
            uint256 cappedPower = powerLegVolume > maxPowerContribution ? maxPowerContribution : powerLegVolume;
            uint256 qualifiedVolume = cappedPower + otherLegsVolume;

            if (qualifiedVolume >= required) {
                achievedRank = i + 1; // OSLO 1-7
            }

            unchecked { ++i; }
        }

        return achievedRank;
    }

    /// @notice Get detailed volume breakdown for a user in a given week
    /// @return totalVolume Total weekly volume
    /// @return powerLegVolume Volume from the power leg
    /// @return otherLegsVolume Volume from all other legs combined
    /// @return powerLegAddress The address of the power leg root
    /// @return rank The highest rank achieved (0-7)
    function getWeeklyStats(address user, uint256 week) external view returns (
        uint256 totalVolume,
        uint256 powerLegVolume,
        uint256 otherLegsVolume,
        address powerLegAddress,
        uint8 rank
    ) {
        totalVolume = weeklyTotalVolume[user][week];
        powerLegAddress = weeklyPowerLeg[user][week];
        powerLegVolume = weeklyLegVolume[user][week][powerLegAddress];
        otherLegsVolume = totalVolume - powerLegVolume;
        rank = calculateRank(user, week);
    }

    /// @notice Claim weekly leadership bonus for a past week
    /// @param week The week number to claim (must be in the past)
    function claimWeeklyBonus(uint256 week) external nonReentrant {
        uint256 currentWeek = block.timestamp / WEEKLY_CYCLE_DURATION;
        if (week >= currentWeek) revert CannotClaimCurrentWeek();
        if (bonusClaimed[msg.sender][week]) revert AlreadyClaimed();

        uint8 rank = calculateRank(msg.sender, week);
        if (rank == 0) revert NoRankAchieved();

        bonusClaimed[msg.sender][week] = true;

        // Bonus = weekly total volume * rank's bonus rate
        uint256 weeklyVolume = weeklyTotalVolume[msg.sender][week];
        uint256 bonusRate = ranks[rank - 1].bonusRateBps;
        uint256 bonusUSDT = (weeklyVolume * bonusRate) / 10000;

        // Record against 3X cap
        if (address(investmentEngine) != address(0)) {
            investmentEngine.recordExternalEarning(msg.sender, bonusUSDT);
        }

        // Convert to OSLO at DEX price
        uint256 osloPrice = osloDEX.getPrice();
        if (osloPrice == 0) revert DEXPriceZero();

        // USDT (18 decimals) → OSLO (18 decimals)
        // osloPrice is in 1e18 precision (USDT per OSLO scaled to 18 decimals)
        // bonusUSDT is in 1e18 (USDT), so: osloAmount = bonusUSDT * 1e18 / osloPrice
        uint256 osloAmount = (bonusUSDT * 1e18) / osloPrice;

        // Release OSLO from vault
        rewardVault.releaseOSLO(msg.sender, osloAmount);

        totalBonusPaid[msg.sender] += bonusUSDT;

        emit LeadershipBonusPaid(msg.sender, rank, week, bonusUSDT, osloAmount, block.timestamp);
    }

    /// @notice Get the current week number
    function getCurrentWeek() external view returns (uint256) {
        return block.timestamp / WEEKLY_CYCLE_DURATION;
    }

    /// @notice Get all rank configurations
    function getAllRanks() external view returns (RankConfig[7] memory) {
        return ranks;
    }

    /// @notice Initialize the 7 rank configurations
    function _initRanks() internal {
        ranks[0] = RankConfig(10_000 * 1e18, 100);    // OSLO 1: $10K, 1.00%
        ranks[1] = RankConfig(25_000 * 1e18, 50);     // OSLO 2: $25K, 0.50%
        ranks[2] = RankConfig(75_000 * 1e18, 30);     // OSLO 3: $75K, 0.30%
        ranks[3] = RankConfig(200_000 * 1e18, 20);    // OSLO 4: $200K, 0.20%
        ranks[4] = RankConfig(500_000 * 1e18, 15);    // OSLO 5: $500K, 0.15%
        ranks[5] = RankConfig(1_200_000 * 1e18, 10);  // OSLO 6: $1.2M, 0.10%
        ranks[6] = RankConfig(2_500_000 * 1e18, 5);   // OSLO 7: $2.5M, 0.05%
    }
}
