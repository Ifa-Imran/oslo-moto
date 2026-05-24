// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IRankSystem.sol";
import "./interfaces/IDAO.sol";
import "./interfaces/ILiquidityManager.sol";

/// @title OSLOTreasury
/// @notice Autonomous fee router. No EOA can withdraw funds.
/// @dev V2: Receives fees, distributes 100% to Liquidity. Rank/DAO distributions made from LP.
contract OSLOTreasury is ITreasury, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;

    address public rankSystem;
    address public dao;
    address public liquidityManager;
    address public timelock;
    address public admin; // Only for initial setup, then renounced

    uint256 public override totalReceived;
    uint256 public totalDistributed;
    uint256 public pendingDistribution;

    bool public setupComplete;

    // ─── Events ─────────────────────────────────────────────────────────
    event FeesReceived(uint256 amount);
    event Distributed(uint256 toRank, uint256 toDAO, uint256 toLP);
    event TokensRescued(address indexed token, uint256 amount, address to);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error SetupAlreadyComplete();
    error NotConfigured();
    error NothingToDistribute();
    error CannotRescueProtocolTokens();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
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

    // ─── Setup (pre-Timelock) ───────────────────────────────────────────

    function configure(
        address _rankSystem,
        address _dao,
        address _liquidityManager,
        address _timelock
    ) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        rankSystem = _rankSystem;
        dao = _dao;
        liquidityManager = _liquidityManager;
        timelock = _timelock;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (rankSystem == address(0) || dao == address(0) || liquidityManager == address(0))
            revert NotConfigured();
        setupComplete = true;
        admin = address(0);
    }

    // ─── Core Functions ─────────────────────────────────────────────────

    /// @notice Called by InvestmentEngine to deposit fees. Caller must have approved USDT.
    function receiveFees(uint256 amount) external override {
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        totalReceived += amount;
        pendingDistribution += amount;
        emit FeesReceived(amount);
    }

    /// @notice Permissionless distribution of accumulated fees.
    /// @dev 100% to Liquidity. Rank bonuses and DAO royalties are paid from Liquidity itself.
    function distribute() external override nonReentrant {
        if (pendingDistribution == 0) revert NothingToDistribute();
        if (liquidityManager == address(0)) revert NotConfigured();

        uint256 amount = pendingDistribution;
        pendingDistribution = 0;

        // 100% to Liquidity Manager
        usdt.safeTransfer(liquidityManager, amount);
        ILiquidityManager(liquidityManager).addLiquidityFromFees(amount);

        totalDistributed += amount;
        emit Distributed(0, 0, amount);
    }

    /// @notice Rescue accidentally sent tokens. Only callable by DAO Timelock.
    /// @dev Explicitly blocked for USDT and OSLO to prevent rug pulls.
    function rescueERC20(address token, uint256 amount) external onlyTimelock {
        if (token == address(usdt) || token == address(osloToken))
            revert CannotRescueProtocolTokens();
        IERC20(token).safeTransfer(timelock, amount);
        emit TokensRescued(token, amount, timelock);
    }
}
