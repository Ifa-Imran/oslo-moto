// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IOsloToken.sol";
import "../interfaces/IOsloDEX.sol";
import "../interfaces/IReferralRegistry.sol";
import "../interfaces/ILevelIncomeSystem.sol";
import "../interfaces/IRewardVault.sol";
import "../interfaces/ILeadershipBonus.sol";

/// @title InvestmentEngineV2 - Fixed version with externalEarnings separation
/// @notice Separates staking yield tracking from external earnings (commissions/bonuses)
///         to prevent the dual-use totalEarnings flaw that blocks yield claims.
///
/// @dev ROOT CAUSE OF THE BUG (V1):
///      In V1, totalEarnings served two purposes:
///        1. Double-claim prevention: claimable = accrued - totalEarnings
///        2. 3X cap tracking: effectiveEarnings = totalEarnings + seededEarnings
///      recordExternalEarning() added level commissions to totalEarnings,
///      inflating it beyond accrued yield, which made claimable = 0.
///
/// @dev FIX (V2):
///      A new per-user `externalEarnings` mapping tracks commissions/bonuses separately.
///      - Double-claim prevention still uses only totalEarnings (staking yield only)
///      - 3X cap check uses totalEarnings + externalEarnings + seededEarnings
///      - recordExternalEarning() only updates externalEarnings, never totalEarnings
///      - UserStake struct is UNCHANGED (7 fields) → interface-compatible with V1
contract InvestmentEngineV2 is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant LEVEL_SYSTEM_ROLE = keccak256("LEVEL_SYSTEM_ROLE");

    struct UserStake {
        uint256 activeStake;       // USDT amount (18 decimals on BSC)
        uint256 totalEarnings;     // Staking yield credited to THIS stake only (18 decimals)
        uint256 stakeStartTime;    // Unix timestamp
        uint8 stakeDayIndex;       // 0-6 rotation
        uint8 tier;                // 1 or 2
        address referrer;          // Upline
        bool isActive;             // Stake status
    }

    IERC20 public immutable usdt;
    IOsloToken public immutable osloToken;
    IOsloDEX public immutable osloDEX;
    IRewardVault public immutable rewardVault;
    IReferralRegistry public immutable referralRegistry;
    ILevelIncomeSystem public immutable levelSystem;
    ILeadershipBonus public leadershipBonus;

    address public companyWallet;
    address public perfWallet;
    address public rewardWallet;
    address public daoContract;

    mapping(address => UserStake[]) private _userStakes;
    mapping(address => uint256) public totalClaimed;
    mapping(address => uint256) public seededEarnings;
    /// @notice Per-user external earnings (level commissions + leadership bonuses)
    ///         Tracked separately from totalEarnings to prevent claim blocking.
    mapping(address => uint256) public externalEarnings;
    mapping(address => bool) public hasStaked;
    uint256 public totalProtocolTurnover;
    uint256 public totalActiveStakes;
    uint256 public totalUsers;

    uint16[7] public tier1Rates = [100, 75, 95, 65, 100, 85, 55];
    uint16[7] public tier2Rates = [115, 100, 115, 110, 105, 100, 125];

    uint256 public constant TIER1_MIN = 10 * 1e18;
    uint256 public constant TIER1_MAX = 2499 * 1e18;
    uint256 public constant TIER2_MIN = 2500 * 1e18;
    uint256 public constant TIER2_MAX = 5000 * 1e18;
    uint256 public constant MAX_TOTAL_STAKE_PER_USER = 5000 * 1e18;

    event Staked(address indexed user, uint256 amount, uint8 tier, address referrer, uint256 timestamp);
    event YieldClaimed(address indexed user, uint256 usdtValue, uint256 osloAmount, uint256 osloPrice);
    event ThreeXCapReached(address indexed user, uint256 totalEarnings, uint256 cap);
    event EarningStopped(address indexed user, uint256 timestamp);
    event ExternalEarningRecorded(address indexed user, uint256 amount);

    error ZeroAmount();
    error InvalidTier();
    error NoActiveStake();
    error NoYieldToClaim();
    error InvalidAmount();
    error ZeroAddress();
    error TotalStakeExceeded();

    constructor(
        address _usdt,
        address _osloToken,
        address _osloDEX,
        address _rewardVault,
        address _referralRegistry,
        address _levelSystem,
        address _companyWallet,
        address _perfWallet
    ) {
        if (_usdt == address(0) || _osloToken == address(0) || _osloDEX == address(0)) revert ZeroAddress();
        if (_rewardVault == address(0) || _referralRegistry == address(0)) revert ZeroAddress();
        if (_levelSystem == address(0) || _companyWallet == address(0) || _perfWallet == address(0)) revert ZeroAddress();

        usdt = IERC20(_usdt);
        osloToken = IOsloToken(_osloToken);
        osloDEX = IOsloDEX(_osloDEX);
        rewardVault = IRewardVault(_rewardVault);
        referralRegistry = IReferralRegistry(_referralRegistry);
        levelSystem = ILevelIncomeSystem(_levelSystem);
        companyWallet = _companyWallet;
        perfWallet = _perfWallet;
        rewardWallet = _rewardVault;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /// @notice Stake USDT into the protocol
    function stake(uint256 amount, uint8 tier, address referrer) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (tier == 1) {
            if (amount < TIER1_MIN || amount > TIER1_MAX) revert InvalidAmount();
        } else if (tier == 2) {
            if (amount < TIER2_MIN || amount > TIER2_MAX) revert InvalidAmount();
        } else {
            revert InvalidTier();
        }

        uint256 currentTotal = _getTotalActiveStake(msg.sender);
        if (currentTotal + amount > MAX_TOTAL_STAKE_PER_USER) revert TotalStakeExceeded();

        usdt.safeTransferFrom(msg.sender, address(this), amount);
        _splitDeposit(amount);

        if (referrer != address(0) && referralRegistry.directReferrer(msg.sender) == address(0)) {
            referralRegistry.registerReferral(msg.sender, referrer);
        }

        _userStakes[msg.sender].push(UserStake({
            activeStake: amount,
            totalEarnings: 0,
            stakeStartTime: block.timestamp,
            stakeDayIndex: uint8(block.timestamp / 1 days) % 7,
            tier: tier,
            referrer: referrer,
            isActive: true
        }));

        if (!hasStaked[msg.sender]) {
            hasStaked[msg.sender] = true;
            totalUsers++;
        }

        totalProtocolTurnover += amount;
        totalActiveStakes += amount;

        if (address(leadershipBonus) != address(0)) {
            leadershipBonus.recordStakeVolume(msg.sender, amount);
        }

        emit Staked(msg.sender, amount, tier, referrer, block.timestamp);
    }

    /// @notice Admin-only: seed a stake for a user during migration (no USDT transfer)
    function adminSeedStake(address user, uint256 amount, uint8 tier, uint256 earnings) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (tier != 1 && tier != 2) revert InvalidTier();

        _userStakes[user].push(UserStake({
            activeStake: amount,
            totalEarnings: 0,
            stakeStartTime: block.timestamp,
            stakeDayIndex: uint8(block.timestamp / 1 days) % 7,
            tier: tier,
            referrer: address(0),
            isActive: true
        }));
        seededEarnings[user] += earnings;

        if (!hasStaked[user]) {
            hasStaked[user] = true;
            totalUsers++;
        }

        totalProtocolTurnover += amount;
        totalActiveStakes += amount;

        if (address(leadershipBonus) != address(0)) {
            leadershipBonus.recordStakeVolume(user, amount);
        }

        emit Staked(user, amount, tier, address(0), block.timestamp);
    }

    /// @notice Admin-only: seed totalClaimed for a user during migration
    function adminSeedClaimed(address user, uint256 amount) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        totalClaimed[user] = amount;
    }

    /// @notice Admin-only: set seeded earnings for a user
    function adminSetSeededEarnings(address user, uint256 amount) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        seededEarnings[user] = amount;
    }

    /// @notice Admin-only: set external earnings for a user (migration)
    function adminSetExternalEarnings(address user, uint256 amount) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        externalEarnings[user] = amount;
    }

    /// @notice Admin-only: batch import a stake with full state for migration
    /// @param user User address
    /// @param activeStake Stake amount
    /// @param totalEarnings Yield earnings to preserve
    /// @param stakeStartTime Original start time
    /// @param stakeDayIndex Day index
    /// @param tier Tier (1 or 2)
    /// @param referrer Referrer address
    /// @param isActive Active status
    function adminImportStake(
        address user,
        uint256 activeStake,
        uint256 totalEarnings,
        uint256 stakeStartTime,
        uint8 stakeDayIndex,
        uint8 tier,
        address referrer,
        bool isActive
    ) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (activeStake == 0) revert ZeroAmount();

        _userStakes[user].push(UserStake({
            activeStake: activeStake,
            totalEarnings: totalEarnings,
            stakeStartTime: stakeStartTime,
            stakeDayIndex: stakeDayIndex,
            tier: tier,
            referrer: referrer,
            isActive: isActive
        }));

        if (isActive) {
            totalActiveStakes += activeStake;
        }

        if (!hasStaked[user]) {
            hasStaked[user] = true;
            totalUsers++;
        }

        totalProtocolTurnover += activeStake;

        emit Staked(user, activeStake, tier, referrer, stakeStartTime);
    }

                /// @notice Calculate accrued yield for a single stake
    function _calculateStakeYield(UserStake memory s) internal view returns (uint256) {
        if (!s.isActive) return 0;

        uint256 timeElapsed = block.timestamp - s.stakeStartTime;
        uint256 completeDays = timeElapsed / 1 days;
        uint256 remainingSeconds = timeElapsed % 1 days;

        uint256 yieldAmount = 0;

        for (uint256 i = 0; i < completeDays;) {
            uint8 dayIndex = uint8((s.stakeDayIndex + i) % 7);
            uint16 rate = s.tier == 1 ? tier1Rates[dayIndex] : tier2Rates[dayIndex];
            yieldAmount += (s.activeStake * rate) / 10000;
            unchecked { ++i; }
        }

        if (remainingSeconds > 0 && completeDays < 365) {
            uint8 currentDayIndex = uint8((s.stakeDayIndex + completeDays) % 7);
            uint16 currentRate = s.tier == 1 ? tier1Rates[currentDayIndex] : tier2Rates[currentDayIndex];
            uint256 dailyYield = (s.activeStake * currentRate) / 10000;
            yieldAmount += (dailyYield * remainingSeconds) / 1 days;
        }

        return yieldAmount;
    }

    /// @notice Calculate accrued yield for a user across all active stakes
    function calculateAccruedYield(address user) public view returns (uint256) {
        UserStake[] memory userStakes = _userStakes[user];
        uint256 totalYield = 0;

        for (uint256 i = 0; i < userStakes.length;) {
            totalYield += _calculateStakeYield(userStakes[i]);
            unchecked { ++i; }
        }

        return totalYield;
    }

    /// @notice Claim accrued yield - converts to OSLO at DEX price
    function claimYield() external nonReentrant whenNotPaused {
        UserStake[] storage userStakes = _userStakes[msg.sender];
        if (userStakes.length == 0) revert NoActiveStake();

        uint256 totalClaimable = 0;
        bool hasActiveStake = false;

        for (uint256 i = 0; i < userStakes.length;) {
            UserStake storage s = userStakes[i];
            if (!s.isActive) {
                unchecked { ++i; }
                continue;
            }

            hasActiveStake = true;

            // Double-claim prevention: only staking yield tracked in totalEarnings
            uint256 accrued = _calculateStakeYield(s);
            uint256 claimableForStake = accrued > s.totalEarnings ? accrued - s.totalEarnings : 0;
            if (claimableForStake == 0) {
                unchecked { ++i; }
                continue;
            }

            // 3X cap: includes staking yield + external earnings + seeded earnings
            uint256 cap = s.activeStake * 3;
            uint256 effectiveEarnings = s.totalEarnings + externalEarnings[msg.sender] + seededEarnings[msg.sender];
            if (effectiveEarnings >= cap) {
                unchecked { ++i; }
                continue;
            }
            uint256 projectedTotal = effectiveEarnings + claimableForStake;

            if (projectedTotal >= cap) {
                claimableForStake = cap - effectiveEarnings;
                s.isActive = false;
                totalActiveStakes -= s.activeStake;
                emit ThreeXCapReached(msg.sender, cap, cap);
                emit EarningStopped(msg.sender, block.timestamp);
            }

            // Only staking yield is added to totalEarnings (NOT external earnings)
            s.totalEarnings += claimableForStake;
            totalClaimable += claimableForStake;

            unchecked { ++i; }
        }

        if (!hasActiveStake) revert NoActiveStake();
        if (totalClaimable == 0) revert NoYieldToClaim();

        totalClaimed[msg.sender] += totalClaimable;

        uint256 osloPrice = osloDEX.getPrice();
        require(osloPrice > 0, "DEX price is zero");

        uint256 osloAmount = (totalClaimable * 1e18) / osloPrice;
        rewardVault.releaseOSLO(msg.sender, osloAmount);

        levelSystem.distributeCommissions(msg.sender, totalClaimable);

        emit YieldClaimed(msg.sender, totalClaimable, osloAmount, osloPrice);
    }

    /// @notice Record external earnings (from level commissions / leadership bonuses)
    /// @dev V2 FIX: Only updates externalEarnings mapping, does NOT touch totalEarnings.
    ///      This prevents the dual-use flaw where commissions blocked staking yield claims.
    function recordExternalEarning(address user, uint256 usdtAmount) external onlyRole(LEVEL_SYSTEM_ROLE) {
        externalEarnings[user] += usdtAmount;
        emit ExternalEarningRecorded(user, usdtAmount);
    }

    /// @notice Split deposit into DEX, Vault, Company, Performance, DAO
    function _splitDeposit(uint256 amount) internal {
        uint256 toVault = (amount * 200) / 10000;
        uint256 toCompany = (amount * 100) / 10000;
        uint256 toPerf = (amount * 100) / 10000;

        if (daoContract != address(0)) {
            uint256 toDEX = (amount * 9550) / 10000;
            uint256 toDAO = amount - toDEX - toVault - toCompany - toPerf;
            usdt.safeTransfer(address(osloDEX), toDEX);
            usdt.safeTransfer(rewardWallet, toVault);
            usdt.safeTransfer(companyWallet, toCompany);
            usdt.safeTransfer(perfWallet, toPerf);
            usdt.safeTransfer(daoContract, toDAO);
        } else {
            uint256 toDEX = (amount * 9600) / 10000;
            uint256 toPerfActual = amount - toDEX - toVault - toCompany;
            usdt.safeTransfer(address(osloDEX), toDEX);
            usdt.safeTransfer(rewardWallet, toVault);
            usdt.safeTransfer(companyWallet, toCompany);
            usdt.safeTransfer(perfWallet, toPerfActual);
        }

        osloDEX.depositLiquidity(daoContract != address(0) ? (amount * 9550) / 10000 : (amount * 9600) / 10000, address(rewardVault));
    }

    function setCompanyWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        companyWallet = _wallet;
    }

    function setPerfWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        perfWallet = _wallet;
    }

    function setRewardWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        rewardWallet = _wallet;
    }

    function setDAOContract(address _dao) external onlyRole(ADMIN_ROLE) {
        if (_dao == address(0)) revert ZeroAddress();
        daoContract = _dao;
    }

    function setLeadershipBonus(address _lb) external onlyRole(ADMIN_ROLE) {
        if (_lb == address(0)) revert ZeroAddress();
        leadershipBonus = ILeadershipBonus(_lb);
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    function getTotalActiveStake(address user) external view returns (uint256) {
        return _getTotalActiveStake(user);
    }

    function getRemainingStakeCapacity(address user) external view returns (uint256) {
        uint256 current = _getTotalActiveStake(user);
        if (current >= MAX_TOTAL_STAKE_PER_USER) return 0;
        return MAX_TOTAL_STAKE_PER_USER - current;
    }

    function _getTotalActiveStake(address user) internal view returns (uint256 total) {
        UserStake[] storage stakes_ = _userStakes[user];
        for (uint256 i = 0; i < stakes_.length;) {
            if (stakes_[i].isActive) {
                total += stakes_[i].activeStake;
            }
            unchecked { ++i; }
        }
    }

    function getUserStakes(address user) external view returns (UserStake[] memory) {
        return _userStakes[user];
    }

    function getUserStake(address user) external view returns (UserStake memory) {
        return _aggregateStake(user);
    }

    function stakes(address user) external view returns (UserStake memory) {
        return _aggregateStake(user);
    }

    /// @notice Aggregate all stakes into a single summary
    function _aggregateStake(address user) internal view returns (UserStake memory) {
        UserStake[] memory userStakeList = _userStakes[user];
        if (userStakeList.length == 0) {
            return UserStake(0, 0, 0, 0, 0, address(0), false);
        }

        uint256 totalActive = 0;
        uint256 totalEarningsAll = 0;
        uint256 earliestStart = type(uint256).max;
        uint256 latestStart = 0;
        bool anyActive = false;
        uint8 latestTier = 0;
        address latestReferrer = address(0);

        for (uint256 i = 0; i < userStakeList.length;) {
            UserStake memory s = userStakeList[i];
            totalEarningsAll += s.totalEarnings;
            if (s.isActive) {
                totalActive += s.activeStake;
                anyActive = true;
                if (s.stakeStartTime < earliestStart) earliestStart = s.stakeStartTime;
                if (s.stakeStartTime > latestStart) {
                    latestStart = s.stakeStartTime;
                    latestTier = s.tier;
                    latestReferrer = s.referrer;
                }
            }
            unchecked { ++i; }
        }

        // Include external + seeded earnings in aggregate totalEarnings for display/cap
        uint256 aggregateEarnings = totalEarningsAll + externalEarnings[user] + seededEarnings[user];

        return UserStake({
            activeStake: totalActive,
            totalEarnings: aggregateEarnings,
            stakeStartTime: earliestStart == type(uint256).max ? 0 : earliestStart,
            stakeDayIndex: 0,
            tier: latestTier,
            referrer: latestReferrer,
            isActive: anyActive
        });
    }

    /// @notice Get claimable yield for a user
    function getClaimableYield(address user) external view returns (uint256) {
        UserStake[] memory userStakes = _userStakes[user];
        uint256 totalClaimable = 0;

        for (uint256 i = 0; i < userStakes.length;) {
            UserStake memory s = userStakes[i];
            if (!s.isActive) {
                unchecked { ++i; }
                continue;
            }

            // Double-claim prevention: only staking yield in totalEarnings
            uint256 accrued = _calculateStakeYield(s);
            if (accrued <= s.totalEarnings) {
                unchecked { ++i; }
                continue;
            }

            uint256 claimableForStake = accrued - s.totalEarnings;

            // 3X cap: includes external earnings + seeded earnings
            uint256 cap = s.activeStake * 3;
            uint256 effectiveEarnings = s.totalEarnings + externalEarnings[user] + seededEarnings[user];

            if (effectiveEarnings >= cap) {
                unchecked { ++i; }
                continue;
            }

            if (effectiveEarnings + claimableForStake > cap) {
                claimableForStake = cap - effectiveEarnings;
            }

            totalClaimable += claimableForStake;
            unchecked { ++i; }
        }

        return totalClaimable;
    }

    /// @notice Get total active stake volume from a user's entire team (20 levels)
    function getTeamVolume(address user) external view returns (uint256) {
        return _sumTeamVolume(user, 20);
    }

    function _sumTeamVolume(address user, uint256 depth) internal view returns (uint256) {
        if (depth == 0) return 0;
        address[] memory downlines = referralRegistry.getDirectDownlines(user);
        uint256 volume = 0;
        for (uint256 i = 0; i < downlines.length;) {
            UserStake[] memory memberStakes = _userStakes[downlines[i]];
            for (uint256 j = 0; j < memberStakes.length;) {
                volume += memberStakes[j].activeStake;
                unchecked { ++j; }
            }
            volume += _sumTeamVolume(downlines[i], depth - 1);
            unchecked { ++i; }
        }
        return volume;
    }
}
