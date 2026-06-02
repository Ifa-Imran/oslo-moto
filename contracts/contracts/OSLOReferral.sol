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
/// @dev V3: $1 USDT registration fee → injected directly into DEX liquidity. No OSLO removed.
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
    error OnlyTimelock();
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

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
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

    // ─── Migration (Admin only, before completeSetup) ──────────────────────

    /// @notice Migrate users from testnet — admin only, before completeSetup.
    /// @dev Registers users without charging the $1 fee. Call with parents before children.
    function migrateUsers(
        address[] calldata _users,
        address[] calldata _referrers,
        uint256[] calldata _unlockedLevels
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        require(_users.length == _referrers.length && _users.length == _unlockedLevels.length, "Length mismatch");

        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            address referrer = _referrers[i];
            if (userInfo[user].registered) continue; // skip duplicates

            userInfo[user].referrer = referrer;
            userInfo[user].registered = true;
            userInfo[user].unlockedLevels = _unlockedLevels[i];

            if (referrer != address(0)) {
                userInfo[referrer].directReferrals.push(user);
            }
            totalRegistered++;

            emit UserRegistered(user, referrer);
        }
    }

    /// @notice Migrate referral earnings from old contracts — admin only, before completeSetup.
    /// @param _users Array of user addresses
    /// @param _totalEarned Array of totalEarned values (18 decimals)
    /// @param _referralRewards Array of pending referralRewards (18 decimals)
    function migrateEarnings(
        address[] calldata _users,
        uint256[] calldata _totalEarned,
        uint256[] calldata _referralRewards
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        require(_users.length == _totalEarned.length && _users.length == _referralRewards.length, "Length mismatch");
        for (uint256 i = 0; i < _users.length; i++) {
            userInfo[_users[i]].totalEarned = _totalEarned[i];
            referralRewards[_users[i]] = _referralRewards[i];
        }
    }

    // ─── Registration ($1 USDT Fee) ─────────────────────────────────────

    /// @notice Register a new user with a referrer. $1 USDT fee → injected directly into DEX liquidity.
    /// @dev $1 USDT is sent straight to DEX reserves — no OSLO is removed or burned.
    function register(address user, address referrer) external override {
        if (user == address(0)) revert ZeroAddress();
        if (userInfo[user].registered) revert AlreadyRegistered();
        if (user == referrer) revert SelfReferral();
        if (referrer != address(0) && !userInfo[referrer].registered) revert InvalidReferrer();

        // Charge $1 USDT registration fee
        usdt.safeTransferFrom(user, address(this), REGISTRATION_FEE);
        totalFeesCollected += REGISTRATION_FEE;

        // Route fee to DEX as pure liquidity injection — no OSLO removed
        if (osloDex != address(0)) {
            usdt.forceApprove(osloDex, REGISTRATION_FEE);
            try IOSLODEX(osloDex).injectUSDTLiquidity(REGISTRATION_FEE) {
                emit RegistrationFeeProcessed(user, REGISTRATION_FEE, 0);
            } catch {
                // If injection fails, USDT stays in contract
                // Can be recovered by admin before completeSetup
            }
        }

        userInfo[user].registered = true;
        userInfo[user].referrer = referrer;
        userInfo[user].unlockedLevels = 1; // Level 1 unlocked by default so immediate upline gets commission

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
    ///      Returns total commission distributed so IE can fund this contract.
    /// @param user The user whose earnings generated the commission
    /// @param profitAmount The profit portion of the user's claim (USDT-denominated)
    /// @return totalDistributed Total USDT commission accrued across all upline levels
    function distributeReferralCommission(address user, uint256 profitAmount) external override onlyInvestmentEngine returns (uint256 totalDistributed) {
        if (profitAmount == 0) return 0;

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
                    totalDistributed += commission;

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

    /// @notice Claim accumulated referral rewards. Income tracked in USDT, paid in equivalent OSLO.
    /// @dev Converts USDT-denominated commission to OSLO at current DEX rate.
    function claimReferralRewards() external override nonReentrant {
        uint256 amount = referralRewards[msg.sender];
        if (amount == 0) revert NothingToClaim();

        referralRewards[msg.sender] = 0;

        // Convert USDT-denominated commission to OSLO at current DEX rate
        uint256 osloAmount = IOSLODEX(osloDex).getUSDTForOSLOOutput(amount);
        if (osloAmount == 0) revert NothingToClaim();

        // Pay commission in OSLO from contract's OSLO reserve
        osloToken.safeTransfer(msg.sender, osloAmount);

        emit ReferralRewardsClaimed(msg.sender, amount);
    }

    /// @notice Update the InvestmentEngine address. Only callable by Timelock after setup.
    /// @dev Used when redeploying InvestmentEngine with new features.
    function setInvestmentEngine(address _investmentEngine) external onlyTimelock {
        investmentEngine = _investmentEngine;
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
        return 1; // Level 1 always available for registered users
    }

    /// @dev Get commission rate for a specific level
    function _getCommissionRate(uint256 level) internal pure returns (uint256) {
        if (level == 1) return OSLOConstants.REFERRAL_L1_BP;
        if (level == 2) return OSLOConstants.REFERRAL_L2_BP;
        if (level >= 3 && level <= 10) return OSLOConstants.REFERRAL_L3_10_BP;
        if (level >= 11 && level <= 20) return OSLOConstants.REFERRAL_L11_20_BP;
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
