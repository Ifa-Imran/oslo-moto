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

    // ─── Core Functions ─────────────────────────────────────────────────

    /// @notice Deposit USDT into the investment engine. No deposit fee — full amount staked.
    /// @dev USDT flows to DEX as liquidity; equivalent OSLO pulled from DEX to contract reserve.
    /// @param amount Amount of USDT to deposit
    function deposit(uint256 amount) external nonReentrant {
        if (depositsPaused) revert DepositsPausedError();
        if (amount < OSLOConstants.TIER1_MIN) revert DepositTooLow();
        if (amount > OSLOConstants.MAX_DEPOSIT_PER_TX) revert DepositTooHigh();
        if (osloDex == address(0)) revert NotConfigured();

        // Transfer USDT from user to this contract
        usdt.safeTransferFrom(msg.sender, address(this), amount);

        // Approve and send USDT to DEX, receive OSLO in return
        usdt.forceApprove(osloDex, amount);
        uint256 osloReceived = IOSLODEX(osloDex).processDeposit(amount);
        // OSLO is now held by this contract as reserve (transferred by DEX)

        // Determine tier and daily rate based on amount
        uint256 tier = _getTier(amount);
        uint256 dailyRate = _getDailyRate(amount);

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

        // Update referral levels
        if (referral != address(0)) {
            IReferral(referral).checkAndUnlockLevels(msg.sender);
        }

        // Record turnover for rank system (for all uplines)
        if (rankSystem != address(0) && referral != address(0)) {
            _recordTurnoverForUplines(msg.sender, amount);
        }

        emit Deposited(msg.sender, amount, tier, dailyRate, userDeposits[msg.sender].length - 1);
    }

    /// @notice Claim accrued rewards from a specific deposit. Rewards paid in OSLO from contract reserve.
    /// @param depositIndex Index of the deposit in user's deposits array
    function claimRewards(uint256 depositIndex) external nonReentrant {
        Deposit storage dep = _getActiveDeposit(msg.sender, depositIndex);

        uint256 pendingUSDT = _calculatePendingRewards(msg.sender, dep);
        if (pendingUSDT == 0) revert NothingToClaim();

        // Minimum withdrawal threshold check
        if (pendingUSDT < OSLOConstants.MIN_WITHDRAWAL_THRESHOLD) revert BelowWithdrawalThreshold();

        // Combined 3X cap check
        uint256 maxCombined = dep.amount * OSLOConstants.RETURN_CAP_MULTIPLIER;
        UserInfo storage userInfo = users[msg.sender];
        uint256 remainingCap = maxCombined > userInfo.totalCombinedEarnings
            ? maxCombined - userInfo.totalCombinedEarnings
            : 0;

        if (remainingCap == 0) {
            dep.active = false;
            emit CombinedCapReached(msg.sender);
            revert DepositCapped();
        }

        if (pendingUSDT > remainingCap) {
            pendingUSDT = remainingCap;
        }

        // Apply 10% withdrawal fee on rewards
        uint256 fee = (pendingUSDT * OSLOConstants.WITHDRAWAL_FEE_BP) / OSLOConstants.BASIS_POINTS;
        uint256 netUSDT = pendingUSDT - fee;

        // Convert net USDT reward to OSLO at DEX spot price
        uint256 osloAmount = IOSLODEX(osloDex).getUSDTForOSLOOutput(netUSDT);
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

        // Transfer OSLO reward to user
        osloToken.safeTransfer(msg.sender, osloAmount);

        // Distribute referral commission on the profit portion
        // Commission = 0.50% of deposit is the profit basis (per original spec)
        // V2: commission is 5% of pendingUSDT (standard profit share)
        if (referral != address(0)) {
            uint256 profitPortion = (pendingUSDT * 5) / 100; // 5% profit portion for commissions
            if (profitPortion > 0) {
                IReferral(referral).distributeReferralCommission(msg.sender, profitPortion);
            }
        }

        emit RewardsClaimed(msg.sender, pendingUSDT, osloAmount, depositIndex);
        emit CombinedEarningsUpdated(msg.sender, userInfo.totalCombinedEarnings);
    }

    /// @notice Early exit — withdraw remaining principal at any time.
    /// @dev Deducts already-claimed rewards from principal. Returns net principal in USDT from DEX.
    /// @param depositIndex Index of the deposit
    function withdrawPrincipal(uint256 depositIndex) external nonReentrant {
        Deposit storage dep = _getActiveDeposit(msg.sender, depositIndex);

        uint256 principal = dep.amount;
        uint256 netPrincipal;

        // Deduct already-claimed rewards from principal
        if (principal > dep.totalClaimed) {
            netPrincipal = principal - dep.totalClaimed;
        } else {
            netPrincipal = 0; // All principal has been returned as rewards
        }

        // Mark deposit as inactive
        dep.active = false;
        users[msg.sender].totalActiveDeposit -= principal;
        totalWithdrawn += principal;

        // Update referral levels
        if (referral != address(0)) {
            IReferral(referral).checkAndUnlockLevels(msg.sender);
        }

        // Return net principal in USDT (pull from DEX liquidity)
        if (netPrincipal > 0) {
            // Approve OSLO to send to DEX, get USDT back
            uint256 osloAmount = IOSLODEX(osloDex).getUSDTForOSLOOutput(netPrincipal);
            if (osloAmount > 0 && osloToken.balanceOf(address(this)) >= osloAmount) {
                osloToken.forceApprove(osloDex, osloAmount);
                IOSLODEX(osloDex).processWithdrawal(osloAmount, msg.sender);
            } else {
                // Fallback: send USDT directly if available
                usdt.safeTransfer(msg.sender, netPrincipal);
            }
        }

        emit PrincipalWithdrawn(msg.sender, netPrincipal, depositIndex);
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
        return _getTier(users[user].totalActiveDeposit);
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

    /// @dev Determine tier (1-4) based on USDT amount
    function _getTier(uint256 amount) internal pure returns (uint256) {
        if (amount >= OSLOConstants.TIER4_MIN) return 4;
        if (amount >= OSLOConstants.TIER3_MIN) return 3;
        if (amount >= OSLOConstants.TIER2_MIN) return 2;
        return 1;
    }

    /// @notice Get the daily rate (in bp) for a given USDT amount.
    /// @dev Before 3 months: tier-based ranged rate (linear interpolation within tier).
    ///      After 3 months: flat 0.45% lifetime rate for all stakes.
    function _getDailyRate(uint256 amount) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - launchTimestamp;

        // After 3 months: lifetime 0.45% rate applies to ALL stakes (new and re-stakes)
        if (elapsed >= OSLOConstants.LIFETIME_RATE_START) {
            return OSLOConstants.LIFETIME_RATE;
        }

        uint256 tier = _getTier(amount);

        // Linear interpolation within tier's min/max rate range
        if (tier == 1) {
            return _interpolate(amount, OSLOConstants.TIER1_MIN, OSLOConstants.TIER1_MAX,
                OSLOConstants.TIER1_RATE_MIN, OSLOConstants.TIER1_RATE_MAX);
        }
        if (tier == 2) {
            return _interpolate(amount, OSLOConstants.TIER2_MIN, OSLOConstants.TIER2_MAX,
                OSLOConstants.TIER2_RATE_MIN, OSLOConstants.TIER2_RATE_MAX);
        }
        if (tier == 3) {
            return _interpolate(amount, OSLOConstants.TIER3_MIN, OSLOConstants.TIER3_MAX,
                OSLOConstants.TIER3_RATE_MIN, OSLOConstants.TIER3_RATE_MAX);
        }
        // Tier 4: $5,000+ — interpolate up to implicit max ($50,000)
        uint256 cappedAmount = amount > OSLOConstants.TIER4_IMPLICIT_MAX
            ? OSLOConstants.TIER4_IMPLICIT_MAX : amount;
        return _interpolate(cappedAmount, OSLOConstants.TIER4_MIN, OSLOConstants.TIER4_IMPLICIT_MAX,
            OSLOConstants.TIER4_RATE_MIN, OSLOConstants.TIER4_RATE_MAX);
    }

    /// @dev Linear interpolation: rate = minRate + (amount - minAmt) * (maxRate - minRate) / (maxAmt - minAmt)
    function _interpolate(
        uint256 amount,
        uint256 minAmt,
        uint256 maxAmt,
        uint256 minRate,
        uint256 maxRate
    ) internal pure returns (uint256) {
        if (maxAmt <= minAmt) return minRate;
        uint256 rateRange = maxRate - minRate;
        uint256 amtRange = maxAmt - minAmt;
        return minRate + ((amount - minAmt) * rateRange) / amtRange;
    }

    function _calculatePendingRewards(address user, Deposit storage dep) internal view returns (uint256 pendingUSDT) {
        if (!dep.active) return 0;

        uint256 timeElapsed = block.timestamp - dep.lastClaimTime;
        if (timeElapsed == 0) return 0;

        // Re-compute daily rate (may have changed to lifetime rate if 3 months passed)
        uint256 effectiveRate = _getDailyRate(dep.amount);
        // Use the better of the cached rate or current rate (lifetime rate may be lower)
        if (block.timestamp - launchTimestamp >= OSLOConstants.LIFETIME_RATE_START) {
            effectiveRate = OSLOConstants.LIFETIME_RATE;
        }

        // pending = (depositAmount * rate * timeElapsed) / (1 day * BASIS_POINTS)
        pendingUSDT = (dep.amount * effectiveRate * timeElapsed) / (1 days * OSLOConstants.BASIS_POINTS);

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
