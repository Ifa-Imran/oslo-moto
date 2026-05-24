// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IReferral.sol";
import "./interfaces/IInvestmentEngine.sol";
import "./interfaces/IOSLODEX.sol";

/// @title OSLOReferral
/// @notice Decentralized 20-level referral tree with level unlocking and USDT commission distribution.
/// @dev V2: $1 USDT registration fee → routed to DEX as liquidity. OSLO received is burned.
contract OSLOReferral is IReferral, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Structs ────────────────────────────────────────────────────────

    struct UserReferralInfo {
        address referrer;
        address[] directReferrals;
        uint256 unlockedLevels;
        uint256 totalEarned;        // Total USDT-equivalent commissions earned
        bool registered;
    }

    // ─── State ──────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;
    address public investmentEngine;
    address public osloDex;
    address public admin;
    address public timelock;
    bool public setupComplete;

    uint256 public constant REGISTRATION_FEE = 1 * 1e18; // $1 USDT

    mapping(address => UserReferralInfo) public userInfo;
    mapping(address => uint256) public referralRewards;    // USDT-denominated pending commissions
    mapping(address => mapping(uint256 => uint256)) public levelIncome; // Per-level income (USDT-denominated)
    uint256 public totalRegistered;
    uint256 public totalCommissionsPaid;
    uint256 public totalFeesCollected; // Total registration fees collected

    // ─── Events ─────────────────────────────────────────────────────────
    event UserRegistered(address indexed user, address indexed referrer);
    event LevelUnlocked(address indexed user, uint256 level);
    event ReferralPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount);
    event ReferralRewardsClaimed(address indexed user, uint256 amount);
    event RegistrationFeeProcessed(address indexed user, uint256 fee, uint256 osloBurned);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyInvestmentEngine();
    error SetupAlreadyComplete();
    error AlreadyRegistered();
    error InvalidReferrer();
    error NotRegistered();
    error NothingToClaim();
    error SelfReferral();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyInvestmentEngine() {
        if (msg.sender != investmentEngine) revert OnlyInvestmentEngine();
        _;
    }

    constructor(address _usdt, address _osloToken) {
        if (_usdt == address(0) || _osloToken == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloToken = IERC20(_osloToken);
        admin = msg.sender;
    }

    // ─── Setup ──────────────────────────────────────────────────────────

    function configure(
        address _investmentEngine,
        address _osloDex,
        address _timelock
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        investmentEngine = _investmentEngine;
        osloDex = _osloDex;
        timelock = _timelock;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        setupComplete = true;
        admin = address(0);
    }

    // ─── Registration ($1 USDT Fee) ─────────────────────────────────────

    /// @notice Register a new user with a referrer. $1 USDT fee → DEX liquidity + OSLO burn.
    /// @dev $1 USDT is swapped for OSLO on DEX, then OSLO is permanently burned.
    function register(address user, address referrer) external override {
        if (user == address(0)) revert ZeroAddress();
        if (userInfo[user].registered) revert AlreadyRegistered();
        if (user == referrer) revert SelfReferral();
        if (referrer != address(0) && !userInfo[referrer].registered) revert InvalidReferrer();

        // Charge $1 USDT registration fee
        usdt.safeTransferFrom(user, address(this), REGISTRATION_FEE);
        totalFeesCollected += REGISTRATION_FEE;

        // Route fee to DEX as liquidity: swap USDT for OSLO, then burn OSLO
        if (osloDex != address(0)) {
            usdt.forceApprove(osloDex, REGISTRATION_FEE);
            try IOSLODEX(osloDex).swapUSDTForOSLO(REGISTRATION_FEE, 0) returns (uint256 osloReceived) {
                if (osloReceived > 0) {
                    osloToken.safeTransfer(OSLOConstants.DEAD_ADDRESS, osloReceived);
                    emit RegistrationFeeProcessed(user, REGISTRATION_FEE, osloReceived);
                }
            } catch {
                // If DEX swap fails (e.g. no reserves yet), USDT stays in contract
                // Can be recovered by admin before completeSetup
            }
        }

        userInfo[user].registered = true;
        userInfo[user].referrer = referrer;
        userInfo[user].unlockedLevels = 0;

        if (referrer != address(0)) {
            userInfo[referrer].directReferrals.push(user);
        }

        totalRegistered++;

        emit UserRegistered(user, referrer);
    }

    // ─── Level Unlocking ────────────────────────────────────────────────

    /// @notice Check and auto-unlock levels based on qualified direct referrals
    function checkAndUnlockLevels(address user) external override {
        if (!userInfo[user].registered) return;

        uint256 qualifiedDirects = _countQualifiedDirects(user);
        uint256 newLevel = _getMaxUnlockedLevel(qualifiedDirects);

        if (newLevel > userInfo[user].unlockedLevels) {
            uint256 oldLevel = userInfo[user].unlockedLevels;
            userInfo[user].unlockedLevels = newLevel;
            for (uint256 i = oldLevel + 1; i <= newLevel; i++) {
                emit LevelUnlocked(user, i);
            }
        }
    }

    // ─── Commission Distribution ────────────────────────────────────────

    /// @notice Distribute referral commissions on the profit portion of downline earnings.
    /// @dev Called by InvestmentEngine on each claim. Commissions accrue in USDT.
    /// @param user The user whose earnings generated the commission
    /// @param profitAmount The profit portion of the user's claim (USDT-denominated)
    function distributeReferralCommission(address user, uint256 profitAmount) external override {
        if (profitAmount == 0) return;

        address current = user;
        for (uint256 level = 1; level <= OSLOConstants.MAX_REFERRAL_LEVELS; level++) {
            address upline = userInfo[current].referrer;
            if (upline == address(0)) break;

            // Check if upline has this level unlocked
            if (userInfo[upline].unlockedLevels >= level) {
                uint256 commissionRate = _getCommissionRate(level);
                uint256 commission = (profitAmount * commissionRate) / OSLOConstants.BASIS_POINTS;

                if (commission > 0) {
                    referralRewards[upline] += commission;
                    levelIncome[upline][level] += commission;
                    userInfo[upline].totalEarned += commission;
                    totalCommissionsPaid += commission;

                    // Notify InvestmentEngine for combined 3X cap tracking
                    if (investmentEngine != address(0)) {
                        IInvestmentEngine(investmentEngine).notifyLevelIncome(upline, commission);
                    }

                    emit ReferralPaid(upline, user, level, commission);
                }
            }

            current = upline;
        }
    }

    /// @notice Claim accumulated referral rewards. Paid in USDT from contract balance.
    function claimReferralRewards() external override nonReentrant {
        uint256 amount = referralRewards[msg.sender];
        if (amount == 0) revert NothingToClaim();

        referralRewards[msg.sender] = 0;

        // Pay commission in USDT
        usdt.safeTransfer(msg.sender, amount);

        emit ReferralRewardsClaimed(msg.sender, amount);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    function isRegistered(address user) external view override returns (bool) {
        return userInfo[user].registered;
    }

    function getReferrer(address user) external view override returns (address) {
        return userInfo[user].referrer;
    }

    function getDirectReferrals(address user) external view override returns (address[] memory) {
        return userInfo[user].directReferrals;
    }

    function getQualifiedDirectsCount(address user) external view override returns (uint256) {
        return _countQualifiedDirects(user);
    }

    function getUnlockedLevels(address user) external view override returns (uint256) {
        return userInfo[user].unlockedLevels;
    }

    function getTeamSize(address user) external view override returns (uint256) {
        return _getTeamSize(user, 0);
    }

    /// @notice Get level income earned at a specific level (USDT-denominated)
    function getLevelIncome(address user, uint256 level) external view returns (uint256) {
        return levelIncome[user][level];
    }

    /// @notice Get total and per-level income for all 20 levels (index 0 = total)
    /// @return Array of [total, L1, L2, ..., L20] (21 elements)
    function getAllLevelIncome(address user) external view returns (uint256[21] memory) {
        uint256[21] memory result;
        for (uint256 i = 1; i <= OSLOConstants.MAX_REFERRAL_LEVELS; i++) {
            result[i] = levelIncome[user][i];
            result[0] += result[i];
        }
        return result;
    }

    // ─── Internal Functions ─────────────────────────────────────────────

    /// @dev Count direct referrals with >= $100 active deposit
    function _countQualifiedDirects(address user) internal view returns (uint256) {
        uint256 count = 0;
        address[] storage directs = userInfo[user].directReferrals;
        for (uint256 i = 0; i < directs.length; i++) {
            if (investmentEngine != address(0)) {
                uint256 activeDeposit = IInvestmentEngine(investmentEngine).getActiveDeposit(directs[i]);
                if (activeDeposit >= OSLOConstants.QUALIFIED_DIRECT_MIN_DEPOSIT) {
                    count++;
                }
            }
        }
        return count;
    }

    /// @dev Get maximum unlocked level based on qualified directs count
    function _getMaxUnlockedLevel(uint256 qualifiedDirects) internal pure returns (uint256) {
        if (qualifiedDirects >= 7) return 20;
        if (qualifiedDirects >= 5) return 16;
        if (qualifiedDirects >= 3) return 12;
        if (qualifiedDirects >= 2) return 8;
        if (qualifiedDirects >= 1) return 3;
        return 0;
    }

    /// @dev Get commission rate for a specific level
    function _getCommissionRate(uint256 level) internal pure returns (uint256) {
        if (level == 1) return OSLOConstants.REFERRAL_L1_BP;
        if (level == 2) return OSLOConstants.REFERRAL_L2_BP;
        if (level >= 3 && level <= 10) return OSLOConstants.REFERRAL_L3_10_BP;
        if (level >= 11 && level <= 15) return OSLOConstants.REFERRAL_L11_15_BP;
        if (level >= 16 && level <= 20) return OSLOConstants.REFERRAL_L16_20_BP;
        return 0;
    }

    /// @dev Recursively count team size across 20 levels
    function _getTeamSize(address user, uint256 depth) internal view returns (uint256) {
        if (depth >= OSLOConstants.MAX_REFERRAL_LEVELS) return 0;

        address[] storage directs = userInfo[user].directReferrals;
        uint256 size = directs.length;
        for (uint256 i = 0; i < directs.length; i++) {
            size += _getTeamSize(directs[i], depth + 1);
        }
        return size;
    }
}
