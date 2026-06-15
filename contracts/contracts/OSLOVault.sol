// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IOSLOVault.sol";
import "./interfaces/IOSLODexV2.sol";
import "./interfaces/IReferral.sol";
import "./interfaces/IRankSystem.sol";

/// @title OSLOVault
/// @notice Core staking contract V3: Consolidated single-pool per user.
/// @dev All deposits merge into one total balance pool. Yield is calculated
///      from the consolidated total, not per-deposit. Uses checkpoint pattern
///      to preserve accrued yield when new deposits are made.
contract OSLOVault is IOSLOVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Structs ────────────────────────────────────────────────────────

    struct UserPool {
        uint256 totalBalance;          // Consolidated USDT principal
        uint256 lastClaimTime;         // Last checkpoint timestamp
        uint256 accruedRewards;        // Yield accrued before last deposit (not yet claimed)
        uint256 totalClaimed;          // Total USDT-equivalent claimed lifetime
        uint256 maxReturn;             // 3X of totalBalance
        uint256 totalCombinedEarnings; // yield + level + rank (for cross-contract tracking)
        uint256 lastDepositTime;       // For early exit window (10 days from last deposit)
        bool active;                   // Whether pool yields
    }

    // ─── State ──────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;
    uint256 public immutable launchTimestamp;

    address public osloDex;          // OSLODexV2 — handles USDT↔OSLO conversions
    address public referral;
    address public rankSystem;
    address public admin;
    address public timelock;
    bool public setupComplete;
    bool public depositsPaused;

    uint256 public minClaimThreshold = 1 * 1e18; // $1 USDT minimum to claim

    // Reward wallets (2% deposit fee split)
    address public rewardWallet;      // 1.0%
    address public companyWallet;     // 0.5%
    address public performanceWallet; // 0.5%

    mapping(address => UserPool) public userPools;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalRewardsPaid;

    // ─── Events ─────────────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount, uint256 newTotal, uint256 tier);
    event RewardsClaimed(address indexed user, uint256 usdtReward, uint256 osloAmount);
    event DepositsPaused(bool paused);
    event CombinedCapReached(address indexed user);
    event CombinedEarningsUpdated(address indexed user, uint256 totalCombined);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error OnlyReferral();
    error OnlyRankSystem();
    error SetupAlreadyComplete();
    error NotConfigured();
    error DepositTooLow();
    error DepositTooHigh();
    error DepositsPausedError();
    error PoolInactive();
    error NothingToClaim();
    error BelowWithdrawalThreshold();
    error DEXNotPriced();
    error ZeroAddress();
    error InsufficientOsloReserve();
    error NoBalance();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    modifier onlyReferral() {
        if (msg.sender != referral) revert OnlyReferral();
        _;
    }

    modifier onlyRankSystem() {
        if (msg.sender != rankSystem) revert OnlyRankSystem();
        _;
    }

    constructor(address _usdt, address _osloToken, uint256 _launchTimestamp) {
        if (_usdt == address(0) || _osloToken == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloToken = IERC20(_osloToken);
        launchTimestamp = _launchTimestamp;
        admin = msg.sender;
    }

    // ─── Setup ──────────────────────────────────────────────────────────

    function configure(
        address _osloDex,
        address _referral,
        address _rankSystem,
        address _timelock
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (_osloDex == address(0)) revert ZeroAddress();
        osloDex = _osloDex;
        referral = _referral;
        rankSystem = _rankSystem;
        timelock = _timelock;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (osloDex == address(0)) revert NotConfigured();
        setupComplete = true;
        admin = address(0);
    }

    function setRewardWallets(
        address _rewardWallet,
        address _companyWallet,
        address _performanceWallet
    ) external {
        if (setupComplete) {
            if (msg.sender != timelock) revert OnlyTimelock();
        } else {
            if (msg.sender != admin) revert OnlyAdmin();
        }
        if (_rewardWallet == address(0) || _companyWallet == address(0) || _performanceWallet == address(0))
            revert ZeroAddress();
        rewardWallet = _rewardWallet;
        companyWallet = _companyWallet;
        performanceWallet = _performanceWallet;
    }

    function setDepositsPaused(bool _paused) external onlyTimelock {
        depositsPaused = _paused;
        emit DepositsPaused(_paused);
    }

    function setReferral(address _referral) external onlyTimelock {
        referral = _referral;
    }

    function setMinClaimThreshold(uint256 _threshold) external onlyTimelock {
        minClaimThreshold = _threshold;
    }

    // ─── Core: Deposit ──────────────────────────────────────────────────

    /// @notice Deposit USDT into the vault. All deposits merge into a single pool.
    /// @dev On each deposit, pending yield is checkpointed before balance update.
    ///      Tier is determined by total consolidated balance.
    /// @param amount Amount of USDT to deposit
    function deposit(uint256 amount) external nonReentrant {
        if (depositsPaused) revert DepositsPausedError();
        if (amount == 0) revert DepositTooLow();
        if (amount > OSLOConstants.MAX_DEPOSIT_PER_TX) revert DepositTooHigh();
        if (osloDex == address(0)) revert NotConfigured();

        UserPool storage pool = userPools[msg.sender];

        // Check total deposit cap
        if (pool.totalBalance + amount > OSLOConstants.MAX_TOTAL_DEPOSIT_PER_USER) revert DepositTooHigh();

        // Checkpoint: save any accrued yield before changing balance
        if (pool.totalBalance > 0 && pool.active) {
            uint256 pending = _calculatePendingRewards(pool);
            pool.accruedRewards += pending;
        }

        // Transfer USDT from user to this contract
        usdt.safeTransferFrom(msg.sender, address(this), amount);

        // Split 2% to reward wallets (1% + 0.5% + 0.5%)
        uint256 dexAmount = amount;
        if (rewardWallet != address(0) && companyWallet != address(0) && performanceWallet != address(0)) {
            uint256 rewardFee = (amount * OSLOConstants.DEPOSIT_TO_REWARD_BP) / OSLOConstants.BASIS_POINTS;
            uint256 companyFee = (amount * OSLOConstants.DEPOSIT_TO_COMPANY_BP) / OSLOConstants.BASIS_POINTS;
            uint256 performanceFee = (amount * OSLOConstants.DEPOSIT_TO_PERFORMANCE_BP) / OSLOConstants.BASIS_POINTS;

            usdt.safeTransfer(rewardWallet, rewardFee);
            usdt.safeTransfer(companyWallet, companyFee);
            usdt.safeTransfer(performanceWallet, performanceFee);

            dexAmount = amount - rewardFee - companyFee - performanceFee;
        }

        // Auto-replenish DEX if OSLO reserve is running low
        _replenishDexIfNeeded(dexAmount);

        // Send remaining USDT to DEX via processBuy() — receives OSLO back
        usdt.forceApprove(osloDex, dexAmount);
        IOSLODexV2(osloDex).processBuy(dexAmount);

        // Update consolidated pool
        bool isFirstDeposit = (pool.totalBalance == 0);
        pool.totalBalance += amount;
        pool.maxReturn = pool.totalBalance * OSLOConstants.RETURN_CAP_MULTIPLIER;
        pool.lastClaimTime = block.timestamp;
        
        // Set lastDepositTime ONLY on first deposit (early exit timer is one-time per account)
        if (isFirstDeposit) {
            pool.lastDepositTime = block.timestamp;
        }
        pool.active = true;

        totalDeposited += amount;

        // Determine tier based on total balance
        uint256 tier = _getPackage(pool.totalBalance);

        // Notify referral system
        if (referral != address(0)) {
            IReferral(referral).checkAndUnlockLevels(msg.sender);
            address depositorReferrer = IReferral(referral).getReferrer(msg.sender);
            if (depositorReferrer != address(0)) {
                IReferral(referral).checkAndUnlockLevels(depositorReferrer);
            }
        }

        // Record turnover for rank system
        if (rankSystem != address(0) && referral != address(0)) {
            _recordTurnoverForUplines(msg.sender, amount);
        }

        emit Deposited(msg.sender, amount, pool.totalBalance, tier);
    }

    // ─── Core: Claim Rewards ────────────────────────────────────────────

    /// @notice Claim all accrued rewards from the consolidated pool.
    /// @dev Yield calculated in USDT from total balance, then converted to OSLO.
    function claimRewards() external nonReentrant {
        UserPool storage pool = userPools[msg.sender];
        if (pool.totalBalance == 0) revert NoBalance();
        if (!pool.active) revert PoolInactive();

        uint256 pendingUSDT = pool.accruedRewards + _calculatePendingRewards(pool);
        if (pendingUSDT == 0) revert NothingToClaim();
        if (pendingUSDT < minClaimThreshold) revert BelowWithdrawalThreshold();

        // Apply 3X cap
        uint256 remaining = pool.maxReturn > pool.totalClaimed ? pool.maxReturn - pool.totalClaimed : 0;
        if (pendingUSDT > remaining) {
            pendingUSDT = remaining;
        }

        // Convert pending USDT yield to OSLO at current DEX price
        uint256 dexPrice = IOSLODexV2(osloDex).getPrice();
        if (dexPrice == 0) revert DEXNotPriced();
        uint256 osloAmount = (pendingUSDT * 1e18) / dexPrice;
        if (osloAmount == 0) revert DEXNotPriced();

        // Verify Vault has enough OSLO reserve
        if (osloToken.balanceOf(address(this)) < osloAmount) revert InsufficientOsloReserve();

        // Update accounting BEFORE transfer
        pool.totalClaimed += pendingUSDT;
        pool.lastClaimTime = block.timestamp;
        pool.accruedRewards = 0;
        pool.totalCombinedEarnings += pendingUSDT;
        totalRewardsPaid += pendingUSDT;

        // Check if 3X cap reached
        if (pool.totalClaimed >= pool.maxReturn) {
            pool.active = false;
            emit CombinedCapReached(msg.sender);
        }

        // Transfer OSLO to user from Vault reserve
        osloToken.safeTransfer(msg.sender, osloAmount);

        // Distribute referral commissions
        if (referral != address(0) && pendingUSDT > 0) {
            uint256 totalCommission = IReferral(referral).distributeReferralCommission(msg.sender, pendingUSDT);
            if (totalCommission > 0) {
                uint256 osloForCommission = (totalCommission * 1e18) / dexPrice;
                if (osloForCommission > 0 && osloToken.balanceOf(address(this)) >= osloForCommission) {
                    osloToken.safeTransfer(referral, osloForCommission);
                }
            }
        }

        emit RewardsClaimed(msg.sender, pendingUSDT, osloAmount);
        emit CombinedEarningsUpdated(msg.sender, pool.totalCombinedEarnings);
    }

    // ─── Cross-Contract Notifications ───────────────────────────────────

    function notifyLevelIncome(address user, uint256 amount) external override onlyReferral {
        userPools[user].totalCombinedEarnings += amount;
        emit CombinedEarningsUpdated(user, userPools[user].totalCombinedEarnings);
    }

    function notifyRankBonus(address user, uint256 amount) external override onlyRankSystem {
        userPools[user].totalCombinedEarnings += amount;
        emit CombinedEarningsUpdated(user, userPools[user].totalCombinedEarnings);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    function getActiveDeposit(address user) external view override returns (uint256) {
        return userPools[user].totalBalance;
    }

    function getUserTier(address user) external view override returns (uint256) {
        if (userPools[user].totalBalance == 0) return 0;
        return _getPackage(userPools[user].totalBalance);
    }

    function getCombinedEarnings(address user) external view returns (uint256) {
        return userPools[user].totalCombinedEarnings;
    }

    function getPendingRewards(address user) external view returns (uint256 pendingUSDT) {
        UserPool storage pool = userPools[user];
        if (pool.totalBalance == 0 || !pool.active) return 0;
        pendingUSDT = pool.accruedRewards + _calculatePendingRewards(pool);
        // Apply 3X cap
        uint256 remaining = pool.maxReturn > pool.totalClaimed ? pool.maxReturn - pool.totalClaimed : 0;
        if (pendingUSDT > remaining) {
            pendingUSDT = remaining;
        }
    }

    function getUserPool(address user) external view returns (
        uint256 totalBalance,
        uint256 lastClaimTime,
        uint256 accruedRewards,
        uint256 totalClaimed,
        uint256 maxReturn,
        uint256 totalCombinedEarnings,
        uint256 lastDepositTime,
        bool active
    ) {
        UserPool storage pool = userPools[user];
        return (
            pool.totalBalance,
            pool.lastClaimTime,
            pool.accruedRewards,
            pool.totalClaimed,
            pool.maxReturn,
            pool.totalCombinedEarnings,
            pool.lastDepositTime,
            pool.active
        );
    }

    // ─── Migration (Admin only, pre-setup) ──────────────────────────────

    struct PoolMigration {
        address owner;
        uint256 totalBalance;
        uint256 lastClaimTime;
        uint256 totalClaimed;
        uint256 totalCombinedEarnings;
        uint256 lastDepositTime;
    }

    function migrateConsolidated(PoolMigration[] calldata entries) external onlyAdmin {
        for (uint256 i = 0; i < entries.length; i++) {
            PoolMigration calldata e = entries[i];
            UserPool storage pool = userPools[e.owner];
            pool.totalBalance = e.totalBalance;
            pool.lastClaimTime = e.lastClaimTime;
            pool.accruedRewards = 0;
            pool.totalClaimed = e.totalClaimed;
            pool.maxReturn = e.totalBalance * OSLOConstants.RETURN_CAP_MULTIPLIER;
            pool.totalCombinedEarnings = e.totalCombinedEarnings;
            pool.lastDepositTime = e.lastDepositTime;
            pool.active = true;
            totalDeposited += e.totalBalance;
        }
    }

    function migrateCombinedEarnings(address[] calldata _users, uint256[] calldata _amounts) external onlyAdmin {
        require(_users.length == _amounts.length, "Length mismatch");
        for (uint256 i = 0; i < _users.length; i++) {
            userPools[_users[i]].totalCombinedEarnings = _amounts[i];
        }
    }

    // ─── Internal Functions ─────────────────────────────────────────────

    function _getPackage(uint256 amount) internal pure returns (uint256) {
        if (amount >= OSLOConstants.PKG2_MIN) return 2;
        return 1;
    }

    function _getDailyRate(uint256 amount, uint256 timestamp) internal view returns (uint256) {
        uint256 elapsed = timestamp - launchTimestamp;
        if (elapsed >= OSLOConstants.LIFETIME_RATE_START) {
            return OSLOConstants.LIFETIME_RATE;
        }
        uint256 dayOfWeek = (timestamp / 86400 + 3) % 7;
        if (amount >= OSLOConstants.PKG2_MIN) {
            return _pkg2Rate(dayOfWeek);
        }
        return _pkg1Rate(dayOfWeek);
    }

    function _pkg1Rate(uint256 day) internal pure returns (uint256) {
        if (day == 0) return OSLOConstants.PKG1_MON;
        if (day == 1) return OSLOConstants.PKG1_TUE;
        if (day == 2) return OSLOConstants.PKG1_WED;
        if (day == 3) return OSLOConstants.PKG1_THU;
        if (day == 4) return OSLOConstants.PKG1_FRI;
        if (day == 5) return OSLOConstants.PKG1_SAT;
        return OSLOConstants.PKG1_SUN;
    }

    function _pkg2Rate(uint256 day) internal pure returns (uint256) {
        if (day == 0) return OSLOConstants.PKG2_MON;
        if (day == 1) return OSLOConstants.PKG2_TUE;
        if (day == 2) return OSLOConstants.PKG2_WED;
        if (day == 3) return OSLOConstants.PKG2_THU;
        if (day == 4) return OSLOConstants.PKG2_FRI;
        if (day == 5) return OSLOConstants.PKG2_SAT;
        return OSLOConstants.PKG2_SUN;
    }

    function _calculatePendingRewards(UserPool storage pool) internal view returns (uint256 pendingUSDT) {
        if (!pool.active || pool.totalBalance == 0) return 0;

        uint256 lastClaim = pool.lastClaimTime;
        uint256 nowTs = block.timestamp;
        if (nowTs <= lastClaim) return 0;

        uint256 elapsed = nowTs - lastClaim;
        uint256 amount = pool.totalBalance;

        // After 3 months: flat lifetime rate
        if (nowTs - launchTimestamp >= OSLOConstants.LIFETIME_RATE_START) {
            pendingUSDT = (amount * OSLOConstants.LIFETIME_RATE * elapsed) / (1 days * OSLOConstants.BASIS_POINTS);
        } else {
            // 7-day rotational schedule based on TOTAL balance tier
            bool isPkg2 = amount >= OSLOConstants.PKG2_MIN;
            uint256 weeklyBp = isPkg2 ? OSLOConstants.PKG2_WEEKLY_TOTAL : OSLOConstants.PKG1_WEEKLY_TOTAL;

            uint256 fullWeeks = elapsed / 7 days;
            pendingUSDT = (amount * weeklyBp * fullWeeks) / OSLOConstants.BASIS_POINTS;

            uint256 remainingStart = lastClaim + (fullWeeks * 7 days);
            uint256 partialBpSeconds = 0;

            while (remainingStart < nowTs) {
                uint256 dayOfWeek = (remainingStart / 86400 + 3) % 7;
                uint256 rate = isPkg2 ? _pkg2Rate(dayOfWeek) : _pkg1Rate(dayOfWeek);

                uint256 dayEnd = ((remainingStart / 86400) + 1) * 86400;
                uint256 periodEnd = nowTs < dayEnd ? nowTs : dayEnd;
                uint256 periodSeconds = periodEnd - remainingStart;

                partialBpSeconds += rate * periodSeconds;
                remainingStart = dayEnd;
            }

            pendingUSDT += (amount * partialBpSeconds) / (1 days * OSLOConstants.BASIS_POINTS);
        }
    }

    function _replenishDexIfNeeded(uint256 dexAmount) internal {
        (uint256 dexUsdt, uint256 dexOslo) = IOSLODexV2(osloDex).getReserves();
        uint256 estimatedOsloNeeded;
        if (dexUsdt > 0 && dexOslo > 0) {
            estimatedOsloNeeded = (dexAmount * dexOslo) / (dexUsdt + dexAmount);
        } else {
            estimatedOsloNeeded = dexAmount;
        }

        uint256 dexOsloBalance = osloToken.balanceOf(osloDex);
        uint256 minBuffer = 1000 * 1e18;
        if (dexOsloBalance < estimatedOsloNeeded + minBuffer) {
            uint256 shortfall = (estimatedOsloNeeded + minBuffer) - dexOsloBalance;
            uint256 vaultOsloBalance = osloToken.balanceOf(address(this));
            if (vaultOsloBalance >= shortfall) {
                osloToken.forceApprove(osloDex, shortfall);
                IOSLODexV2(osloDex).replenishOsloReserve(shortfall);
            }
        }
    }

    function _recordTurnoverForUplines(address user, uint256 amount) internal {
        if (referral == address(0) || rankSystem == address(0)) return;
        address current = user;
        for (uint256 i = 0; i < OSLOConstants.MAX_REFERRAL_LEVELS; i++) {
            address upline = IReferral(referral).getReferrer(current);
            if (upline == address(0)) break;
            IRankSystem(rankSystem).recordTurnover(upline, current, amount);
            current = upline;
        }
    }
}
