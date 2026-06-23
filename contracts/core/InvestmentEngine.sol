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

/// @title InvestmentEngine - The Central Nervous System
/// @notice Manages staking, yield calculation, and claim logic with 3X cap enforcement
contract InvestmentEngine is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant LEVEL_SYSTEM_ROLE = keccak256("LEVEL_SYSTEM_ROLE");

    struct UserStake {
        uint256 activeStake;       // USDT amount (18 decimals on BSC)
        uint256 totalEarnings;     // Lifetime earnings tracking (18 decimals)
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
    ILeadershipBonus public leadershipBonus; // Settable — allows deploying LB separately

    address public companyWallet;
    address public perfWallet;
    address public rewardWallet; // 2% USDT destination (settable, defaults to rewardVault)
    address public daoContract;  // 0.5% USDT destination (settable, set after DAO deployment)

    mapping(address => UserStake[]) private _userStakes;
    mapping(address => uint256) public totalClaimed;
    mapping(address => bool) public hasStaked;
    uint256 public totalProtocolTurnover;
    uint256 public totalActiveStakes;
    uint256 public totalUsers;

    // Basis points arrays (10000 = 100%)
    uint16[7] public tier1Rates = [100, 75, 95, 65, 100, 85, 55]; // 5.75% weekly
    uint16[7] public tier2Rates = [115, 100, 115, 110, 105, 100, 125]; // 7.70% weekly

    // Tier thresholds (USDT 18 decimals on BSC)
    uint256 public constant TIER1_MIN = 10 * 1e18;    // $10
    uint256 public constant TIER1_MAX = 2499 * 1e18;  // $2,499
    uint256 public constant TIER2_MIN = 2500 * 1e18;  // $2,500
    uint256 public constant TIER2_MAX = 5000 * 1e18;  // $5,000
    uint256 public constant MAX_TOTAL_STAKE_PER_USER = 5000 * 1e18; // $5,000 max total per wallet

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
        rewardWallet = _rewardVault; // Default to vault, can be changed via setRewardWallet

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /// @notice Stake USDT into the protocol
    /// @param amount USDT amount to stake (18 decimals on BSC)
    /// @param tier Staking tier (1 or 2)
    /// @param referrer Referrer address (use address(0) if no referrer)
    function stake(uint256 amount, uint8 tier, address referrer) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        // Validate tier and amount
        if (tier == 1) {
            if (amount < TIER1_MIN || amount > TIER1_MAX) revert InvalidAmount();
        } else if (tier == 2) {
            if (amount < TIER2_MIN || amount > TIER2_MAX) revert InvalidAmount();
        } else {
            revert InvalidTier();
        }

        // Enforce max $5,000 total active stake per wallet
        uint256 currentTotal = _getTotalActiveStake(msg.sender);
        if (currentTotal + amount > MAX_TOTAL_STAKE_PER_USER) revert TotalStakeExceeded();

        // Transfer USDT from user
        usdt.safeTransferFrom(msg.sender, address(this), amount);

        // Split deposit (96/2/1/1)
        _splitDeposit(amount);

        // Register referral if provided and user hasn't registered yet
        if (referrer != address(0) && referralRegistry.directReferrer(msg.sender) == address(0)) {
            referralRegistry.registerReferral(msg.sender, referrer);
        }

        // Create new stake entry
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

        // Record staking volume for weekly leadership bonus (walks referral tree)
        if (address(leadershipBonus) != address(0)) {
            leadershipBonus.recordStakeVolume(msg.sender, amount);
        }

        emit Staked(msg.sender, amount, tier, referrer, block.timestamp);
    }

    /// @notice Admin-only: seed a stake for a user during migration (no USDT transfer)
    /// @param user The user address to seed the stake for
    /// @param amount USDT amount to stake (18 decimals on BSC)
    /// @param tier Staking tier (1 or 2)
    /// @param earnings Lifetime earnings to preserve (18 decimals)
    function adminSeedStake(address user, uint256 amount, uint8 tier, uint256 earnings) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (tier != 1 && tier != 2) revert InvalidTier();

        // Create stake entry (no USDT transfer, no split, no cap check — migration only)
        _userStakes[user].push(UserStake({
            activeStake: amount,
            totalEarnings: earnings,
            stakeStartTime: block.timestamp,
            stakeDayIndex: uint8(block.timestamp / 1 days) % 7,
            tier: tier,
            referrer: address(0),
            isActive: true
        }));

        if (!hasStaked[user]) {
            hasStaked[user] = true;
            totalUsers++;
        }

        totalProtocolTurnover += amount;
        totalActiveStakes += amount;

        // Record staking volume for weekly leadership bonus
        if (address(leadershipBonus) != address(0)) {
            leadershipBonus.recordStakeVolume(user, amount);
        }

        emit Staked(user, amount, tier, address(0), block.timestamp);
    }

    /// @notice Admin-only: seed totalClaimed for a user during migration
    /// @param user The user address
    /// @param amount Total claimed amount to set (18 decimals)
    function adminSeedClaimed(address user, uint256 amount) external onlyRole(ADMIN_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        totalClaimed[user] = amount;
    }

    /// @notice Calculate accrued yield for a single stake (accrues per second)
    function _calculateStakeYield(UserStake memory s) internal view returns (uint256) {
        if (!s.isActive) return 0;

        uint256 timeElapsed = block.timestamp - s.stakeStartTime;
        uint256 completeDays = timeElapsed / 1 days;
        uint256 remainingSeconds = timeElapsed % 1 days; // seconds into current incomplete day

        uint256 yieldAmount = 0;

        // Yield from complete days (full daily rate applied)
        for (uint256 i = 0; i < completeDays;) {
            uint8 dayIndex = uint8((s.stakeDayIndex + i) % 7);
            uint16 rate = s.tier == 1 ? tier1Rates[dayIndex] : tier2Rates[dayIndex];
            yieldAmount += (s.activeStake * rate) / 10000;
            unchecked { ++i; }
        }

        // Proportional yield for the current incomplete day (accrues per second)
        // This ensures yield grows continuously, not just at day boundaries
        if (remainingSeconds > 0 && completeDays < 365) {
            uint8 currentDayIndex = uint8((s.stakeDayIndex + completeDays) % 7);
            uint16 currentRate = s.tier == 1 ? tier1Rates[currentDayIndex] : tier2Rates[currentDayIndex];
            uint256 dailyYield = (s.activeStake * currentRate) / 10000;
            // Proportional: dailyYield * (remainingSeconds / 1 days)
            yieldAmount += (dailyYield * remainingSeconds) / 1 days;
        }

        return yieldAmount;
    }

    /// @notice Calculate accrued yield for a user across all active stakes
    /// @param user The user address
    /// @return yield The total accrued yield in USDT (18 decimals)
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

            uint256 accrued = _calculateStakeYield(s);
            uint256 claimableForStake = accrued > s.totalEarnings ? accrued - s.totalEarnings : 0;
            if (claimableForStake == 0) {
                unchecked { ++i; }
                continue;
            }

            // Check 3X cap per stake
            uint256 cap = s.activeStake * 3;
            uint256 projectedTotal = s.totalEarnings + claimableForStake;

            if (projectedTotal >= cap) {
                claimableForStake = cap - s.totalEarnings;
                s.isActive = false;
                totalActiveStakes -= s.activeStake;
                emit ThreeXCapReached(msg.sender, cap, cap);
                emit EarningStopped(msg.sender, block.timestamp);
            }

            s.totalEarnings += claimableForStake;
            totalClaimable += claimableForStake;

            unchecked { ++i; }
        }

        if (!hasActiveStake) revert NoActiveStake();
        if (totalClaimable == 0) revert NoYieldToClaim();

        totalClaimed[msg.sender] += totalClaimable;

        // Convert USDT yield to OSLO at DEX price
        uint256 osloPrice = osloDEX.getPrice();
        require(osloPrice > 0, "DEX price is zero");

        // totalClaimable is USDT (18 decimals), osloPrice is 18 decimals
        // osloAmount (18 decimals) = usdtAmount (18 decimals) * 1e18 / price
        uint256 osloAmount = (totalClaimable * 1e18) / osloPrice;

        // Release OSLO from vault to user
        rewardVault.releaseOSLO(msg.sender, osloAmount);

        // Trigger level commission distribution
        levelSystem.distributeCommissions(msg.sender, totalClaimable);

        emit YieldClaimed(msg.sender, totalClaimable, osloAmount, osloPrice);
    }

    /// @notice Record external earnings (from level commissions) against 3X cap
    /// @param user The user receiving external earnings
    /// @param usdtAmount The USDT equivalent value
    function recordExternalEarning(address user, uint256 usdtAmount) external onlyRole(LEVEL_SYSTEM_ROLE) {
        UserStake[] storage userStakes = _userStakes[user];
        uint256 remaining = usdtAmount;

        for (uint256 i = 0; i < userStakes.length && remaining > 0;) {
            UserStake storage s = userStakes[i];
            if (!s.isActive) {
                unchecked { ++i; }
                continue;
            }

            uint256 cap = s.activeStake * 3;
            uint256 available = cap - s.totalEarnings;

            if (available <= remaining) {
                s.totalEarnings = cap;
                s.isActive = false;
                totalActiveStakes -= s.activeStake;
                remaining -= available;
                emit ThreeXCapReached(user, cap, cap);
                emit EarningStopped(user, block.timestamp);
            } else {
                s.totalEarnings += remaining;
                remaining = 0;
            }

            unchecked { ++i; }
        }

        emit ExternalEarningRecorded(user, usdtAmount);
    }

    /// @notice Split deposit into DEX, Vault, Company, Performance, DAO
    /// @dev Split: 95.5% DEX, 2% vault, 1% company, 1% perf, 0.5% DAO (when daoContract is set)
    ///      Without DAO: 96% DEX, 2% vault, 1% company, 1% perf (backward compatible)
    ///      After sending USDT to DEX, equivalent OSLO is transferred from DEX to RewardVault.
    /// @param amount Total USDT amount to split
    function _splitDeposit(uint256 amount) internal {
        uint256 toVault = (amount * 200) / 10000;       // 2%
        uint256 toCompany = (amount * 100) / 10000;     // 1%
        uint256 toPerf = (amount * 100) / 10000;        // 1%

        if (daoContract != address(0)) {
            uint256 toDEX = (amount * 9550) / 10000;    // 95.5%
            uint256 toDAO = amount - toDEX - toVault - toCompany - toPerf; // 0.5%
            usdt.safeTransfer(address(osloDEX), toDEX);
            usdt.safeTransfer(rewardWallet, toVault);
            usdt.safeTransfer(companyWallet, toCompany);
            usdt.safeTransfer(perfWallet, toPerf);
            usdt.safeTransfer(daoContract, toDAO);
        } else {
            uint256 toDEX = (amount * 9600) / 10000;    // 96%
            uint256 toPerfActual = amount - toDEX - toVault - toCompany; // 1% (avoids rounding)
            usdt.safeTransfer(address(osloDEX), toDEX);
            usdt.safeTransfer(rewardWallet, toVault);
            usdt.safeTransfer(companyWallet, toCompany);
            usdt.safeTransfer(perfWallet, toPerfActual);
        }

        // Transfer equivalent OSLO from DEX to RewardVault
        osloDEX.depositLiquidity(daoContract != address(0) ? (amount * 9550) / 10000 : (amount * 9600) / 10000, address(rewardVault));
    }

    /// @notice Update company wallet (admin only)
    function setCompanyWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        companyWallet = _wallet;
    }

    /// @notice Update performance wallet (admin only)
    function setPerfWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        perfWallet = _wallet;
    }

    /// @notice Update reward wallet — 2% USDT destination (admin only)
    function setRewardWallet(address _wallet) external onlyRole(ADMIN_ROLE) {
        if (_wallet == address(0)) revert ZeroAddress();
        rewardWallet = _wallet;
    }

    /// @notice Set DAO contract address — enables 0.5% DAO royalty funding (admin only)
    function setDAOContract(address _dao) external onlyRole(ADMIN_ROLE) {
        if (_dao == address(0)) revert ZeroAddress();
        daoContract = _dao;
    }

    /// @notice Set the LeadershipBonus contract address (admin only)
    /// @param _lb The LeadershipBonus contract address
    function setLeadershipBonus(address _lb) external onlyRole(ADMIN_ROLE) {
        if (_lb == address(0)) revert ZeroAddress();
        leadershipBonus = ILeadershipBonus(_lb);
    }

    /// @notice Pause the contract (emergency)
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Get total active stake for a user (sum of all active stakes)
    function getTotalActiveStake(address user) external view returns (uint256) {
        return _getTotalActiveStake(user);
    }

    /// @notice Get remaining stake capacity for a user
    function getRemainingStakeCapacity(address user) external view returns (uint256) {
        uint256 current = _getTotalActiveStake(user);
        if (current >= MAX_TOTAL_STAKE_PER_USER) return 0;
        return MAX_TOTAL_STAKE_PER_USER - current;
    }

    /// @notice Internal: sum all active stakes for a user
    function _getTotalActiveStake(address user) internal view returns (uint256 total) {
        UserStake[] storage stakes_ = _userStakes[user];
        for (uint256 i = 0; i < stakes_.length;) {
            if (stakes_[i].isActive) {
                total += stakes_[i].activeStake;
            }
            unchecked { ++i; }
        }
    }

    /// @notice Get all stakes for a user
    function getUserStakes(address user) external view returns (UserStake[] memory) {
        return _userStakes[user];
    }

    /// @notice Get aggregated stake info for backward compatibility
    function getUserStake(address user) external view returns (UserStake memory) {
        return _aggregateStake(user);
    }

    /// @notice Backward-compatible stakes getter returning aggregated data
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
        uint256 totalEarnings = 0;
        uint256 earliestStart = type(uint256).max;
        uint256 latestStart = 0;
        bool anyActive = false;
        uint8 latestTier = 0;
        address latestReferrer = address(0);

        for (uint256 i = 0; i < userStakeList.length;) {
            UserStake memory s = userStakeList[i];
            totalEarnings += s.totalEarnings;
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

        return UserStake({
            activeStake: totalActive,
            totalEarnings: totalEarnings,
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

            uint256 accrued = _calculateStakeYield(s);
            if (accrued <= s.totalEarnings) {
                unchecked { ++i; }
                continue;
            }

            uint256 claimableForStake = accrued - s.totalEarnings;
            uint256 cap = s.activeStake * 3;

            if (s.totalEarnings + claimableForStake > cap) {
                claimableForStake = cap - s.totalEarnings;
            }

            totalClaimable += claimableForStake;
            unchecked { ++i; }
        }

        return totalClaimable;
    }

    /// @notice Get total active stake volume from a user's entire team (20 levels)
    /// @param user The team leader address
    /// @return Total active stake volume in USDT (18 decimals)
    function getTeamVolume(address user) external view returns (uint256) {
        return _sumTeamVolume(user, 20);
    }

    /// @notice Internal recursive team volume calculator
    function _sumTeamVolume(address user, uint256 depth) internal view returns (uint256) {
        if (depth == 0) return 0;
        address[] memory downlines = referralRegistry.getDirectDownlines(user);
        uint256 volume = 0;
        for (uint256 i = 0; i < downlines.length;) {
            // Sum all active stakes for this downline
            UserStake[] memory memberStakes = _userStakes[downlines[i]];
            for (uint256 j = 0; j < memberStakes.length;) {
                volume += memberStakes[j].activeStake;
                unchecked { ++j; }
            }
            // Recurse into deeper levels
            volume += _sumTeamVolume(downlines[i], depth - 1);
            unchecked { ++i; }
        }
        return volume;
    }
}
