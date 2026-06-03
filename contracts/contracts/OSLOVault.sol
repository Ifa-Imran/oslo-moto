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
/// @notice Core staking contract V3: USDT deposits, daily yield paid in OSLO tokens at market price.
/// @dev USDT from deposits flows to DEXv2 as liquidity. OSLO accumulated in Vault for reward payouts.
///      Users see balances in USD. Withdrawals paid in OSLO at current DEX price.
contract OSLOVault is IOSLOVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Structs ────────────────────────────────────────────────────────

    struct Deposit {
        uint256 amount;          // USDT principal amount
        uint256 tier;            // Tier 1 or 2
        uint256 dailyRate;       // Effective daily rate in bp (cached at deposit time)
        uint256 depositTime;     // Timestamp of deposit
        uint256 lastClaimTime;   // Last time rewards were claimed
        uint256 totalClaimed;    // Total USDT-equivalent rewards claimed
        uint256 maxReturn;       // 3X of principal (precomputed)
        bool active;             // Whether this deposit is still yielding
    }

    struct UserInfo {
        uint256 totalActiveDeposit;    // Sum of all active deposit principals (USDT)
        uint256 depositCount;          // Number of deposits
        uint256 totalCombinedEarnings; // Daily yield + level income + rank bonus (USDT-equivalent)
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

    mapping(address => Deposit[]) public userDeposits;
    mapping(address => UserInfo) public users;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalRewardsPaid;

    // ─── Events ─────────────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositIndex);
    event RewardsClaimed(address indexed user, uint256 usdtReward, uint256 osloAmount, uint256 depositIndex);
    event EarlyExited(address indexed user, uint256 amountReturned, uint256 feeDeducted, uint256 yieldDeducted, uint256 depositIndex);
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
    error InvalidDeposit();
    error DepositCapped();
    error NothingToClaim();
    error BelowWithdrawalThreshold();
    error DEXNotPriced();
    error ZeroAddress();
    error InsufficientOsloReserve();
    error NotInEarlyExitPeriod();
    error InvalidExitPercentage();

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

    /// @notice Deposit USDT into the vault. 2% fee split, 98% to DEX as liquidity.
    /// @dev USDT flows to DEXv2 via processBuy(); equivalent OSLO comes back to Vault.
    ///      User's balance tracked in USD. Yield paid in OSLO at current market price.
    /// @param amount Amount of USDT to deposit
    function deposit(uint256 amount) external nonReentrant {
        if (depositsPaused) revert DepositsPausedError();
        if (amount == 0) revert DepositTooLow();
        if (amount > OSLOConstants.MAX_DEPOSIT_PER_TX) revert DepositTooHigh();
        if (users[msg.sender].totalActiveDeposit + amount > OSLOConstants.MAX_TOTAL_DEPOSIT_PER_USER) revert DepositTooHigh();
        if (osloDex == address(0)) revert NotConfigured();

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
        // OSLO is now held by this contract as reserve for future reward payouts

        // Determine package and daily rate
        uint256 tier = _getPackage(amount);
        uint256 dailyRate = _getDailyRate(amount, block.timestamp);

        // Create deposit record
        uint256 maxReturn = amount * OSLOConstants.RETURN_CAP_MULTIPLIER;
        userDeposits[msg.sender].push(Deposit({
            amount: amount,
            tier: tier,
            dailyRate: dailyRate,
            depositTime: block.timestamp,
            lastClaimTime: block.timestamp,
            totalClaimed: 0,
            maxReturn: maxReturn,
            active: true
        }));

        users[msg.sender].totalActiveDeposit += amount;
        users[msg.sender].depositCount++;
        totalDeposited += amount;

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

        emit Deposited(msg.sender, amount, tier, dailyRate, userDeposits[msg.sender].length - 1);
    }

    // ─── Core: Claim Rewards ────────────────────────────────────────────

    /// @notice Claim accrued rewards from a specific deposit.
    /// @dev Yield calculated in USDT, then converted to OSLO at current DEX price.
    ///      OSLO paid from Vault's accumulated reserve.
    /// @param depositIndex Index of the deposit in user's deposits array
    function claimRewards(uint256 depositIndex) external nonReentrant {
        Deposit storage dep = _getActiveDeposit(msg.sender, depositIndex);

        uint256 pendingUSDT = _calculatePendingRewards(dep);
        if (pendingUSDT == 0) revert NothingToClaim();
        if (pendingUSDT < minClaimThreshold) revert BelowWithdrawalThreshold();

        // Convert pending USDT yield to OSLO at current DEX price
        uint256 dexPrice = IOSLODexV2(osloDex).getPrice();
        if (dexPrice == 0) revert DEXNotPriced();
        uint256 osloAmount = (pendingUSDT * 1e18) / dexPrice;
        if (osloAmount == 0) revert DEXNotPriced();

        // Verify Vault has enough OSLO reserve
        if (osloToken.balanceOf(address(this)) < osloAmount) revert InsufficientOsloReserve();

        // Update accounting BEFORE transfer
        dep.totalClaimed += pendingUSDT;
        dep.lastClaimTime = block.timestamp;
        users[msg.sender].totalCombinedEarnings += pendingUSDT;
        totalRewardsPaid += pendingUSDT;

        // Check if 3X cap reached
        if (dep.totalClaimed >= dep.maxReturn) {
            dep.active = false;
            users[msg.sender].totalActiveDeposit -= dep.amount;
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

        emit RewardsClaimed(msg.sender, pendingUSDT, osloAmount, depositIndex);
        emit CombinedEarningsUpdated(msg.sender, users[msg.sender].totalCombinedEarnings);
    }

    // ─── Core: Early Exit ───────────────────────────────────────────────

    /// @notice Full early exit — 100% withdrawal within 10-day window.
    function earlyExit(uint256 depositIndex) external nonReentrant {
        _partialEarlyExit(msg.sender, depositIndex, 10000);
    }

    /// @notice Partial early exit — 100%, 50%, or 25% within 10-day window.
    function partialEarlyExit(uint256 depositIndex, uint256 percentageBp) external nonReentrant {
        _partialEarlyExit(msg.sender, depositIndex, percentageBp);
    }

    function _partialEarlyExit(address user, uint256 depositIndex, uint256 percentageBp) internal {
        if (percentageBp != 10000 && percentageBp != 5000 && percentageBp != 2500) {
            revert InvalidExitPercentage();
        }

        Deposit storage dep = _getActiveDeposit(user, depositIndex);

        if (block.timestamp > dep.depositTime + OSLOConstants.EARLY_EXIT_PERIOD) {
            revert NotInEarlyExitPeriod();
        }

        uint256 principal = dep.amount;
        uint256 exitAmount = (principal * percentageBp) / OSLOConstants.BASIS_POINTS;

        // 10% early exit fee
        uint256 exitFee = (exitAmount * OSLOConstants.EARLY_EXIT_FEE_BP) / OSLOConstants.BASIS_POINTS;

        // Deduct previously claimed yield proportionally
        uint256 earnedDeduction = (dep.totalClaimed * percentageBp) / OSLOConstants.BASIS_POINTS;
        uint256 totalDeductions = exitFee + earnedDeduction;
        uint256 netReturn = exitAmount > totalDeductions ? exitAmount - totalDeductions : 0;

        if (percentageBp == 10000) {
            dep.active = false;
        } else {
            dep.amount -= exitAmount;
            dep.totalClaimed -= earnedDeduction;
            dep.maxReturn = dep.amount * OSLOConstants.RETURN_CAP_MULTIPLIER;
        }

        users[user].totalActiveDeposit -= exitAmount;
        totalWithdrawn += exitAmount;

        // Notify referral system
        if (referral != address(0)) {
            IReferral(referral).checkAndUnlockLevels(user);
        }

        // Return USDT to user via DEX processWithdrawal
        if (netReturn > 0) {
            // Convert USDT value to OSLO amount needed for DEX withdrawal
            uint256 dexPrice = IOSLODexV2(osloDex).getPrice();
            if (dexPrice > 0) {
                uint256 osloNeeded = (netReturn * 1e18) / dexPrice;
                uint256 osloBalance = osloToken.balanceOf(address(this));
                if (osloNeeded > 0 && osloBalance >= osloNeeded) {
                    osloToken.forceApprove(osloDex, osloNeeded);
                    IOSLODexV2(osloDex).processWithdrawal(osloNeeded, user);
                }
            }
        }

        emit EarlyExited(user, netReturn, exitFee, earnedDeduction, depositIndex);
    }

    // ─── Cross-Contract Notifications ───────────────────────────────────

    function notifyLevelIncome(address user, uint256 amount) external override onlyReferral {
        users[user].totalCombinedEarnings += amount;
        emit CombinedEarningsUpdated(user, users[user].totalCombinedEarnings);
    }

    function notifyRankBonus(address user, uint256 amount) external override onlyRankSystem {
        users[user].totalCombinedEarnings += amount;
        emit CombinedEarningsUpdated(user, users[user].totalCombinedEarnings);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    function getActiveDeposit(address user) external view override returns (uint256) {
        return users[user].totalActiveDeposit;
    }

    function getUserTier(address user) external view override returns (uint256) {
        if (users[user].totalActiveDeposit == 0) return 0;
        return _getPackage(users[user].totalActiveDeposit);
    }

    function getDepositCount(address user) external view returns (uint256) {
        return userDeposits[user].length;
    }

    function getCombinedEarnings(address user) external view returns (uint256) {
        return users[user].totalCombinedEarnings;
    }

    function getPendingRewards(address user, uint256 depositIndex) external view returns (uint256 pendingUSDT) {
        if (depositIndex >= userDeposits[user].length) return 0;
        Deposit storage dep = userDeposits[user][depositIndex];
        if (!dep.active) return 0;
        return _calculatePendingRewards(dep);
    }

    /// @notice Check if early exit is available
    function isInEarlyExitPeriod(address user, uint256 depositIndex) external view returns (bool) {
        if (depositIndex >= userDeposits[user].length) return false;
        Deposit storage dep = userDeposits[user][depositIndex];
        if (!dep.active) return false;
        return block.timestamp <= dep.depositTime + OSLOConstants.EARLY_EXIT_PERIOD;
    }

    // ─── Migration (Admin only, pre-setup) ──────────────────────────────

    struct DepositMigration {
        address owner;
        uint256 amount;
        uint256 tier;
        uint256 dailyRate;
        uint256 depositTime;
        uint256 lastClaimTime;
        uint256 totalClaimed;
        uint256 maxReturn;
    }

    function migrateDeposits(DepositMigration[] calldata entries) external onlyAdmin {
        for (uint256 i = 0; i < entries.length; i++) {
            DepositMigration calldata e = entries[i];
            userDeposits[e.owner].push(Deposit({
                amount: e.amount,
                tier: e.tier,
                dailyRate: e.dailyRate,
                depositTime: e.depositTime,
                lastClaimTime: e.lastClaimTime,
                totalClaimed: e.totalClaimed,
                maxReturn: e.maxReturn,
                active: true
            }));
            users[e.owner].totalActiveDeposit += e.amount;
            users[e.owner].depositCount++;
            totalDeposited += e.amount;
        }
    }

    function migrateCombinedEarnings(address[] calldata _users, uint256[] calldata _amounts) external onlyAdmin {
        require(_users.length == _amounts.length, "Length mismatch");
        for (uint256 i = 0; i < _users.length; i++) {
            users[_users[i]].totalCombinedEarnings = _amounts[i];
        }
    }

    // ─── Internal Functions ─────────────────────────────────────────────

    function _getActiveDeposit(address user, uint256 index) internal view returns (Deposit storage) {
        if (index >= userDeposits[user].length) revert InvalidDeposit();
        Deposit storage dep = userDeposits[user][index];
        if (!dep.active) revert DepositCapped();
        return dep;
    }

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

    function _calculatePendingRewards(Deposit storage dep) internal view returns (uint256 pendingUSDT) {
        if (!dep.active) return 0;

        uint256 lastClaim = dep.lastClaimTime;
        uint256 nowTs = block.timestamp;
        if (nowTs <= lastClaim) return 0;

        uint256 elapsed = nowTs - lastClaim;
        uint256 amount = dep.amount;

        // After 3 months: flat lifetime rate
        if (nowTs - launchTimestamp >= OSLOConstants.LIFETIME_RATE_START) {
            pendingUSDT = (amount * OSLOConstants.LIFETIME_RATE * elapsed) / (1 days * OSLOConstants.BASIS_POINTS);
        } else {
            // 7-day rotational schedule
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

        // 3X per-deposit cap
        uint256 remaining = dep.maxReturn > dep.totalClaimed ? dep.maxReturn - dep.totalClaimed : 0;
        if (pendingUSDT > remaining) {
            pendingUSDT = remaining;
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
