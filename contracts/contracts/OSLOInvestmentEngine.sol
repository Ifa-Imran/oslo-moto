// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IInvestmentEngine.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IReferral.sol";
import "./interfaces/IRankSystem.sol";
import "./interfaces/IOSLODEX.sol";


/// @title OSLOInvestmentEngine
/// @notice Core staking contract V2: USDT deposits, ranged tier yields, lifetime 0.45% rate, combined 3X cap.
/// @dev No deposit fee. USDT flows to DEX for liquidity. OSLO paid as rewards from contract reserve.
contract OSLOInvestmentEngine is IInvestmentEngine, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Structs ────────────────────────────────────────────────────────

    struct Deposit {
        uint256 amount;          // USDT principal amount
        uint256 tier;            // Tier 1-4
        uint256 dailyRate;       // Effective daily rate in bp (cached at deposit time)
        uint256 depositTime;     // Timestamp of deposit
        uint256 lastClaimTime;   // Last time rewards were claimed
        uint256 totalClaimed;    // Total USDT-equivalent rewards claimed
        uint256 maxReturn;       // 3X of principal (precomputed)
        bool active;             // Whether this deposit is still yielding
    }

    struct UserInfo {
        uint256 totalActiveDeposit;  // Sum of all active deposit principals (USDT)
        uint256 depositCount;        // Number of deposits
        uint256 totalCombinedEarnings; // Daily yield + level income + rank bonus (USDT-equivalent)
    }

    // ─── State ──────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;
    uint256 public immutable launchTimestamp;
    address public osloDex;          // OSLODEX — handles USDT↔OSLO conversions
    address public treasury;
    address public referral;
    address public rankSystem;
    address public admin;
    address public timelock;
    bool public setupComplete;
    bool public depositsPaused;      // Emergency pause for new deposits only
    uint256 public minClaimThreshold = 1 * 1e18; // $1 USDT minimum to claim (settable by timelock)

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
    event PrincipalWithdrawn(address indexed user, uint256 netPrincipal, uint256 depositIndex);
    event DepositsPaused(bool paused);
    event CombinedCapReached(address indexed user);
    event CombinedEarningsUpdated(address indexed user, uint256 totalCombined);
    event ReferralUpdated(address indexed oldReferral, address indexed newReferral);

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
        address _treasury,
        address _referral,
        address _rankSystem,
        address _osloDex,
        address _timelock
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (_osloDex == address(0)) revert ZeroAddress();
        treasury = _treasury;
        referral = _referral;
        rankSystem = _rankSystem;
        osloDex = _osloDex;
        timelock = _timelock;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (treasury == address(0)) revert NotConfigured();
        setupComplete = true;
        admin = address(0);
    }

    /// @notice Migrate deposit records from testnet snapshot. Only callable by Admin before completeSetup.
    /// @dev Directly injects deposit structs without requiring USDT transfers.
    ///      Used for testnet-to-mainnet migration only. Batched to avoid gas limits.
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

    /// @notice Migrate combined earnings from old contracts — admin only.
    /// @param _users Array of user addresses
    /// @param _amounts Array of totalCombinedEarnings values (18 decimals)
    function migrateCombinedEarnings(address[] calldata _users, uint256[] calldata _amounts) external onlyAdmin {
        require(_users.length == _amounts.length, "Length mismatch");
        for (uint256 i = 0; i < _users.length; i++) {
            users[_users[i]].totalCombinedEarnings = _amounts[i];
        }
    }

    /// @notice Emergency pause for new deposits only. Only callable by Timelock.
    function setDepositsPaused(bool _paused) external onlyTimelock {
        depositsPaused = _paused;
        emit DepositsPaused(_paused);
    }

    /// @notice Update referral contract address. Only callable by Timelock.
    /// @dev Used when redeploying the referral contract with new features.
    function setReferral(address _referral) external onlyTimelock {
        emit ReferralUpdated(referral, _referral);
        referral = _referral;
    }

    /// @notice Set the minimum claim threshold in USDT (18 decimals). Only callable by Timelock.
    /// @param _threshold New minimum threshold (e.g. 1 * 1e18 = $1)
    function setMinClaimThreshold(uint256 _threshold) external onlyTimelock {
        minClaimThreshold = _threshold;
    }

    /// @notice Set reward wallet addresses. Only callable by Admin (before completeSetup) or Timelock (after).
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

    // ─── Core Functions ─────────────────────────────────────────────────

    /// @notice Deposit USDT into the investment engine. No deposit fee — full amount staked.
    /// @dev USDT flows to DEX as liquidity; equivalent OSLO pulled from DEX to contract reserve.
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

        // Ensure DEX has sufficient OSLO reserve for this deposit.
        // SKIP on testnet - DEX already has 66K+ OSLO reserve
        // DEX OSLO is consumed by every deposit but never replenished by sells
        // (tax routing sends 70% to IE + 30% burn, 0% to DEX).
        // InvestmentEngine holds 11M OSLO reserve — auto-refill DEX as needed.
        /* DISABLED FOR TESTNET
        {
            uint256 dexOsloBalance = osloToken.balanceOf(osloDex);
            uint256 estimatedOsloNeeded;
            (uint256 dexUsdt, uint256 dexOslo) = IOSLODEX(osloDex).getReserves();
            if (dexUsdt > 0 && dexOslo > 0) {
                estimatedOsloNeeded = (dexAmount * dexOslo) / (dexUsdt + dexAmount);
            } else {
                estimatedOsloNeeded = dexAmount;
            }
            uint256 minBuffer = 1000 * 1e18; // 1,000 OSLO minimum buffer
            if (dexOsloBalance < estimatedOsloNeeded + minBuffer) {
                uint256 shortfall = (estimatedOsloNeeded + minBuffer) - dexOsloBalance;
                uint256 ieOsloBalance = osloToken.balanceOf(address(this));
                if (ieOsloBalance >= shortfall) {
                    osloToken.approve(osloDex, shortfall);
                    IOSLODEX(osloDex).replenishOsloReserve(shortfall);
                }
            }
        }
        */

        // Approve and send USDT to DEX, receive OSLO in return
        usdt.approve(osloDex, dexAmount);
        uint256 osloReceived = IOSLODEX(osloDex).processDeposit(dexAmount);
        // OSLO is now held by this contract as reserve (transferred by DEX)

        // Determine package and today's daily rate
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

        // Update referral levels — check depositor AND their referrer
        // (this deposit may qualify msg.sender as a "qualified direct" for their upline)
        if (referral != address(0)) {
            IReferral(referral).checkAndUnlockLevels(msg.sender);
            address depositorReferrer = IReferral(referral).getReferrer(msg.sender);
            if (depositorReferrer != address(0)) {
                IReferral(referral).checkAndUnlockLevels(depositorReferrer);
            }
        }

        // Record turnover for rank system (for all uplines)
        if (rankSystem != address(0) && referral != address(0)) {
            _recordTurnoverForUplines(msg.sender, amount);
        }

        emit Deposited(msg.sender, amount, tier, dailyRate, userDeposits[msg.sender].length - 1);
    }

    /// @notice Claim accrued rewards from a specific deposit.
    /// @dev V3: Yield is calculated in USDT. No withdrawal fee — full yield is auto-bought
    ///      into OSLO at the DEX spot rate and sent to the investor.
    ///      OSLO is paid from the contract's reserve (accumulated from deposit swaps).
    /// @param depositIndex Index of the deposit in user's deposits array
    function claimRewards(uint256 depositIndex) external nonReentrant {
        Deposit storage dep = _getActiveDeposit(msg.sender, depositIndex);

        uint256 pendingUSDT = _calculatePendingRewards(msg.sender, dep);
        if (pendingUSDT == 0) revert NothingToClaim();

        // Minimum withdrawal threshold check (settable by timelock, default $1)
        if (pendingUSDT < minClaimThreshold) revert BelowWithdrawalThreshold();

        // Per-deposit 3X cap is already enforced in _calculatePendingRewards.
        // Track combined earnings for informational purposes only.
        UserInfo storage userInfo = users[msg.sender];

        // V3: No withdrawal fee — full yield is auto-bought into OSLO.
        // Convert pending USDT yield to OSLO at DEX spot price (tax-free).
        uint256 osloAmount = IOSLODEX(osloDex).getUSDTForOSLOOutput(pendingUSDT);
        if (osloAmount == 0) revert DEXNotPriced();

        // Verify contract has enough OSLO reserve
        if (osloToken.balanceOf(address(this)) < osloAmount) revert InsufficientOsloReserve();

        // Update accounting BEFORE external call
        dep.totalClaimed += pendingUSDT;
        dep.lastClaimTime = block.timestamp;
        userInfo.totalCombinedEarnings += pendingUSDT;
        totalRewardsPaid += pendingUSDT;

        // Check if cap reached
        if (dep.totalClaimed >= dep.maxReturn) {
            dep.active = false;
            emit CombinedCapReached(msg.sender);
        }

        // Auto-buy: send OSLO tokens to investor (from contract reserve).
        // Frontend displays this as "$X USDT yield → Y OSLO at DEX rate".
        osloToken.safeTransfer(msg.sender, osloAmount);

        // Distribute referral commission — yield on yield
        // Commission is based on the full yield (pendingUSDT), not just a fraction.
        // Upline receives percentage of downline's yield earnings:
        //   L1: 30%, L2: 20%, L3-L10: 1%, L11-L15: 0.50%, L16-L20: 0.25%
        if (referral != address(0)) {
            if (pendingUSDT > 0) {
                uint256 totalCommission = IReferral(referral).distributeReferralCommission(msg.sender, pendingUSDT);
                // Fund referral contract with OSLO (commissions are claimed as OSLO)
                if (totalCommission > 0) {
                    uint256 osloForCommission = IOSLODEX(osloDex).getUSDTForOSLOOutput(totalCommission);
                    if (osloForCommission > 0 && osloToken.balanceOf(address(this)) >= osloForCommission) {
                        osloToken.safeTransfer(referral, osloForCommission);
                    }
                }
            }
        }

        emit RewardsClaimed(msg.sender, pendingUSDT, osloAmount, depositIndex);
        emit CombinedEarningsUpdated(msg.sender, userInfo.totalCombinedEarnings);
    }



    // ─── Cross-Contract Notifications ───────────────────────────────────

    /// @notice Called by OSLOReferral when distributing level income to track combined 3X cap.
    /// @param user The user receiving level income
    /// @param amount USDT-equivalent amount of commission earned
    function notifyLevelIncome(address user, uint256 amount) external override onlyReferral {
        users[user].totalCombinedEarnings += amount;
        emit CombinedEarningsUpdated(user, users[user].totalCombinedEarnings);
    }

    /// @notice Called by OSLORankSystem when paying rank bonuses to track combined 3X cap.
    /// @param user The user receiving rank bonus
    /// @param amount USDT-equivalent amount of bonus earned
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
        return _calculatePendingRewards(user, dep);
    }

    // ─── Internal Functions ─────────────────────────────────────────────

    function _getActiveDeposit(address user, uint256 index) internal view returns (Deposit storage) {
        if (index >= userDeposits[user].length) revert InvalidDeposit();
        Deposit storage dep = userDeposits[user][index];
        if (!dep.active) revert DepositCapped();
        return dep;
    }

    /// @dev Determine package (1 or 2) based on USDT amount
    function _getPackage(uint256 amount) internal pure returns (uint256) {
        if (amount >= OSLOConstants.PKG2_MIN) return 2;
        return 1;
    }

    /// @notice Get the daily rate (in bp) for a given USDT amount on a specific day.
    /// @dev Before 3 months: 7-day rotational schedule per package.
    ///      After 3 months: flat 0.45% lifetime rate for all stakes.
    function _getDailyRate(uint256 amount, uint256 timestamp) internal view returns (uint256) {
        uint256 elapsed = timestamp - launchTimestamp;

        // After 3 months: lifetime 0.45% rate applies to ALL stakes
        if (elapsed >= OSLOConstants.LIFETIME_RATE_START) {
            return OSLOConstants.LIFETIME_RATE;
        }

        // Day of week: 0=Monday, 6=Sunday
        // Unix epoch (Jan 1, 1970) was Thursday, so +3 shifts to Monday=0
        uint256 dayOfWeek = (timestamp / 86400 + 3) % 7;

        if (amount >= OSLOConstants.PKG2_MIN) {
            return _pkg2Rate(dayOfWeek);
        }
        return _pkg1Rate(dayOfWeek);
    }

    /// @dev Package 1 daily rates (Mon-Sun)
    function _pkg1Rate(uint256 day) internal pure returns (uint256) {
        if (day == 0) return OSLOConstants.PKG1_MON;  // 1.00%
        if (day == 1) return OSLOConstants.PKG1_TUE;  // 0.75%
        if (day == 2) return OSLOConstants.PKG1_WED;  // 0.95%
        if (day == 3) return OSLOConstants.PKG1_THU;  // 0.65%
        if (day == 4) return OSLOConstants.PKG1_FRI;  // 1.00%
        if (day == 5) return OSLOConstants.PKG1_SAT;  // 0.85%
        return OSLOConstants.PKG1_SUN;                // 0.55%
    }

    /// @dev Package 2 daily rates (Mon-Sun)
    function _pkg2Rate(uint256 day) internal pure returns (uint256) {
        if (day == 0) return OSLOConstants.PKG2_MON;  // 1.15%
        if (day == 1) return OSLOConstants.PKG2_TUE;  // 1.00%
        if (day == 2) return OSLOConstants.PKG2_WED;  // 1.15%
        if (day == 3) return OSLOConstants.PKG2_THU;  // 1.10%
        if (day == 4) return OSLOConstants.PKG2_FRI;  // 1.05%
        if (day == 5) return OSLOConstants.PKG2_SAT;  // 1.00%
        return OSLOConstants.PKG2_SUN;                // 1.25%
    }

    function _calculatePendingRewards(address user, Deposit storage dep) internal view returns (uint256 pendingUSDT) {
        if (!dep.active) return 0;

        uint256 lastClaim = dep.lastClaimTime;
        uint256 nowTs = block.timestamp;
        if (nowTs <= lastClaim) return 0;

        uint256 elapsed = nowTs - lastClaim;
        uint256 amount = dep.amount;

        // After 3 months: flat lifetime rate (simple calculation)
        if (nowTs - launchTimestamp >= OSLOConstants.LIFETIME_RATE_START) {
            pendingUSDT = (amount * OSLOConstants.LIFETIME_RATE * elapsed) / (1 days * OSLOConstants.BASIS_POINTS);
        } else {
            // 7-day rotational schedule
            bool isPkg2 = amount >= OSLOConstants.PKG2_MIN;
            uint256 weeklyBp = isPkg2 ? OSLOConstants.PKG2_WEEKLY_TOTAL : OSLOConstants.PKG1_WEEKLY_TOTAL;

            // Full weeks optimization: any 7 consecutive days sum to weeklyBp
            uint256 fullWeeks = elapsed / 7 days;
            pendingUSDT = (amount * weeklyBp * fullWeeks) / OSLOConstants.BASIS_POINTS;

            // Partial remaining days (max ~7 loop iterations)
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

        // 3X per-deposit cap check
        uint256 remaining = dep.maxReturn > dep.totalClaimed ? dep.maxReturn - dep.totalClaimed : 0;
        if (pendingUSDT > remaining) {
            pendingUSDT = remaining;
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
