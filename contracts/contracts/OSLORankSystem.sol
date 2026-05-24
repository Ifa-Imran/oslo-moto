// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IRankSystem.sol";
import "./interfaces/IReferral.sol";
import "./interfaces/IInvestmentEngine.sol";

/// @title OSLORankSystem
/// @notice Calculates weekly team turnover and distributes progressive rank bonuses in USDT.
/// @dev V2: Bonuses paid in USDT. Notifies InvestmentEngine for combined 3X cap tracking.
contract OSLORankSystem is IRankSystem, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ──────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    address public investmentEngine;
    address public referral;
    address public admin;
    address public timelock;
    bool public setupComplete;

    /// @notice Weekly turnover per user per weekId: weeklyTurnover[user][weekId]
    mapping(address => mapping(uint256 => uint256)) public weeklyTurnoverData;

    /// @notice Per-leg weekly turnover: legTurnover[user][weekId][legAddress]
    mapping(address => mapping(uint256 => mapping(address => uint256))) public legTurnover;

    /// @notice Whether a user has claimed their bonus for a given week
    mapping(address => mapping(uint256 => bool)) public weekBonusClaimed;

    /// @notice Rank bonus pool balance available for distribution
    uint256 public bonusPoolBalance;

    /// @notice Total bonuses distributed all-time (USDT)
    uint256 public totalBonusesDistributed;

    /// @notice Genesis timestamp for week epoch calculation (set to first Monday UTC)
    uint256 public immutable genesisTimestamp;

    // ─── Events ─────────────────────────────────────────────────────────
    event RankAchieved(address indexed user, uint256 rank, uint256 weekId, uint256 turnover);
    event RankBonusClaimed(address indexed user, uint256 amount, uint256 weekId);
    event BonusPoolFunded(uint256 amount);
    event TurnoverRecorded(address indexed user, uint256 amount, uint256 weekId);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error SetupAlreadyComplete();
    error AlreadyClaimed();
    error NoBonus();
    error InsufficientBonusPool();
    error CurrentWeekNotClaimable();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address _usdt) {
        if (_usdt == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        admin = msg.sender;
        // Set genesis to a fixed Monday 00:00 UTC (Jan 1, 2024 was a Monday)
        genesisTimestamp = 1704067200; // 2024-01-01 00:00:00 UTC (Monday)
    }

    // ─── Setup ──────────────────────────────────────────────────────────

    function configure(address _investmentEngine, address _referral, address _timelock) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        investmentEngine = _investmentEngine;
        referral = _referral;
        timelock = _timelock;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        setupComplete = true;
        admin = address(0);
    }

    // ─── Core Functions ─────────────────────────────────────────────────

    /// @notice Record turnover for a user in the current week. Called by InvestmentEngine.
    /// @param leg The direct child address identifying which referral leg this turnover belongs to
    function recordTurnover(address user, address leg, uint256 amount) external override {
        uint256 weekId = getCurrentWeekId();
        weeklyTurnoverData[user][weekId] += amount;
        legTurnover[user][weekId][leg] += amount;
        emit TurnoverRecorded(user, amount, weekId);
    }

    /// @notice Receive USDT into the bonus pool from Treasury
    function receiveBonusPool(uint256 amount) external override {
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        bonusPoolBalance += amount;
        emit BonusPoolFunded(amount);
    }

    /// @notice Claim rank bonus for a completed week. Paid in USDT.
    /// @dev Can only claim for past weeks, not the current one. Requires 40/60 leg ratio qualification.
    function claimRankBonus() external override nonReentrant {
        uint256 currentWeek = getCurrentWeekId();
        // Claim for the most recent completed week
        uint256 claimWeek = currentWeek - 1;
        if (claimWeek == 0) revert NoBonus();

        if (weekBonusClaimed[msg.sender][claimWeek]) revert AlreadyClaimed();

        // Must satisfy 40/60 leg ratio to qualify
        if (!_isRankQualified(msg.sender, claimWeek)) revert NoBonus();

        uint256 turnover = weeklyTurnoverData[msg.sender][claimWeek];
        uint256 rank = _getRankFromTurnover(turnover);
        if (rank == 0) revert NoBonus();

        uint256 bonusBP = _getRankBonusBP(rank);
        uint256 bonus = (turnover * bonusBP) / OSLOConstants.BASIS_POINTS;

        if (bonus == 0) revert NoBonus();
        if (bonus > bonusPoolBalance) revert InsufficientBonusPool();

        weekBonusClaimed[msg.sender][claimWeek] = true;
        bonusPoolBalance -= bonus;
        totalBonusesDistributed += bonus;

        // Pay bonus in USDT
        usdt.safeTransfer(msg.sender, bonus);

        // Notify InvestmentEngine for combined 3X cap tracking
        if (investmentEngine != address(0)) {
            IInvestmentEngine(investmentEngine).notifyRankBonus(msg.sender, bonus);
        }

        emit RankAchieved(msg.sender, rank, claimWeek, turnover);
        emit RankBonusClaimed(msg.sender, bonus, claimWeek);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    function getCurrentWeekId() public view override returns (uint256) {
        return (block.timestamp - genesisTimestamp) / OSLOConstants.WEEK_DURATION + 1;
    }

    function getCurrentRank(address user) external view override returns (uint256) {
        uint256 weekId = getCurrentWeekId();
        if (!_isRankQualified(user, weekId)) return 0;
        uint256 turnover = weeklyTurnoverData[user][weekId];
        return _getRankFromTurnover(turnover);
    }

    function getWeeklyTurnover(address user, uint256 weekId) external view override returns (uint256) {
        return weeklyTurnoverData[user][weekId];
    }

    function getLegTurnover(address user, uint256 weekId, address leg) external view override returns (uint256) {
        return legTurnover[user][weekId][leg];
    }

    function isRankQualified(address user) external view override returns (bool) {
        uint256 weekId = getCurrentWeekId();
        return _isRankQualified(user, weekId);
    }

    function getPendingBonus(address user) external view returns (uint256) {
        uint256 currentWeek = getCurrentWeekId();
        if (currentWeek <= 1) return 0;
        uint256 claimWeek = currentWeek - 1;
        if (weekBonusClaimed[user][claimWeek]) return 0;

        if (!_isRankQualified(user, claimWeek)) return 0;

        uint256 turnover = weeklyTurnoverData[user][claimWeek];
        uint256 rank = _getRankFromTurnover(turnover);
        if (rank == 0) return 0;

        uint256 bonusBP = _getRankBonusBP(rank);
        return (turnover * bonusBP) / OSLOConstants.BASIS_POINTS;
    }

    // ─── Internal Functions ─────────────────────────────────────────────

    /// @dev Check 40/60 leg ratio: main leg <= 40% of total, other legs >= 60% of total
    function _isRankQualified(address user, uint256 weekId) internal view returns (bool) {
        uint256 totalTurnover = weeklyTurnoverData[user][weekId];
        if (totalTurnover == 0) return false;

        if (referral == address(0)) return true; // No referral set — skip check during setup
        address[] memory directs = IReferral(referral).getDirectReferrals(user);
        if (directs.length == 0) return false;

        uint256 maxLegTurnover = 0;
        for (uint256 i = 0; i < directs.length; i++) {
            uint256 legT = legTurnover[user][weekId][directs[i]];
            if (legT > maxLegTurnover) maxLegTurnover = legT;
        }

        return maxLegTurnover * OSLOConstants.BASIS_POINTS <= totalTurnover * OSLOConstants.RANK_MAIN_LEG_MAX_BP;
    }

    /// @dev Progressive ranking — returns highest rank achieved (1-7, 0 for none)
    function _getRankFromTurnover(uint256 turnover) internal pure returns (uint256) {
        if (turnover >= OSLOConstants.RANK7_TURNOVER) return 7;
        if (turnover >= OSLOConstants.RANK6_TURNOVER) return 6;
        if (turnover >= OSLOConstants.RANK5_TURNOVER) return 5;
        if (turnover >= OSLOConstants.RANK4_TURNOVER) return 4;
        if (turnover >= OSLOConstants.RANK3_TURNOVER) return 3;
        if (turnover >= OSLOConstants.RANK2_TURNOVER) return 2;
        if (turnover >= OSLOConstants.RANK1_TURNOVER) return 1;
        return 0;
    }

    /// @dev Get bonus basis points for a rank (progressive, not cumulative)
    function _getRankBonusBP(uint256 rank) internal pure returns (uint256) {
        if (rank == 7) return OSLOConstants.RANK7_BONUS_BP;
        if (rank == 6) return OSLOConstants.RANK6_BONUS_BP;
        if (rank == 5) return OSLOConstants.RANK5_BONUS_BP;
        if (rank == 4) return OSLOConstants.RANK4_BONUS_BP;
        if (rank == 3) return OSLOConstants.RANK3_BONUS_BP;
        if (rank == 2) return OSLOConstants.RANK2_BONUS_BP;
        if (rank == 1) return OSLOConstants.RANK1_BONUS_BP;
        return 0;
    }
}
