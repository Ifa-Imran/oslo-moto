// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/ILiquidityManager.sol";
import "./interfaces/IOSLODEX.sol";

/// @title OSLOLiquidityManager
/// @notice Manages liquidity for OSLO DEX. Protocol-controlled liquidity only.
/// @dev V2: Routes funds to OSLODEX for USDT/OSLO trading.
contract OSLOLiquidityManager is ILiquidityManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;
    
    address public oslodex; // Custom OSLO DEX contract

    address public admin;
    address public timelock;
    bool public setupComplete;

    uint256 public totalLiquidityAdded;

    // ─── Events ─────────────────────────────────────────────────────────
    event LiquidityAdded(uint256 usdtAmount, uint256 osloAmount);
    event TokensRescued(address indexed token, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error SetupAlreadyComplete();
    error ZeroAmount();
    error ZeroAddress();
    error CannotRescueProtocolTokens();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    constructor(address _usdt, address _osloToken) {
        if (_usdt == address(0) || _osloToken == address(0))
            revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloToken = IERC20(_osloToken);
        admin = msg.sender;
    }

    function configure(address _timelock, address _oslodex) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        timelock = _timelock;
        oslodex = _oslodex;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        setupComplete = true;
        admin = address(0);
    }

    // ─── Core Functions ─────────────────────────────────────────────────

    /// @notice Set up initial liquidity pool. Called once during deployment.
    /// @dev Transfers USDT and OSLO to OSLODEX contract.
    function addInitialLiquidity(uint256 usdtAmount) external onlyAdmin {
        if (usdtAmount == 0) revert ZeroAmount();
        uint256 osloAmount = osloToken.balanceOf(address(this));
        if (osloAmount == 0) revert ZeroAmount();
        
        // Approve OSLODEX to pull tokens
        usdt.forceApprove(oslodex, usdtAmount);
        osloToken.forceApprove(oslodex, osloAmount);
        
        // Add liquidity to OSLODEX
        IOSLODEX(oslodex).addInitialLiquidity(usdtAmount, osloAmount);
        
        totalLiquidityAdded += usdtAmount;
        emit LiquidityAdded(usdtAmount, osloAmount);
    }

    /// @notice Add liquidity from fee distributions. Routes to OSLODEX.
    function addLiquidityFromFees(uint256 usdtAmount) external override nonReentrant {
        if (usdtAmount == 0) revert ZeroAmount();
        
        // Approve OSLODEX to pull USDT
        usdt.forceApprove(oslodex, usdtAmount);
        
        // Add liquidity to OSLODEX
        IOSLODEX(oslodex).addLiquidityFromFees(usdtAmount);
        
        totalLiquidityAdded += usdtAmount;
        emit LiquidityAdded(usdtAmount, 0);
    }

    /// @notice Rescue accidentally sent tokens. Only by DAO Timelock.
    function rescueERC20(address token, uint256 amount) external onlyTimelock {
        if (token == address(usdt) || token == address(osloToken))
            revert CannotRescueProtocolTokens();
        IERC20(token).safeTransfer(timelock, amount);
        emit TokensRescued(token, amount);
    }

    // ─── View Functions ─────────────────────────────────────────────

    /// @notice Get current OSLO price from OSLODEX
    /// @return Price in USDT per OSLO (18 decimals)
    function getOSLOPrice() external view returns (uint256) {
        return IOSLODEX(oslodex).getPrice();
    }

    /// @notice Get DEX reserves
    /// @return _usdtRes USDT reserve in DEX
    /// @return _osloRes OSLO reserve in DEX
    function getDEXReserves() external view returns (uint256 _usdtRes, uint256 _osloRes) {
        return IOSLODEX(oslodex).getReserves();
    }
}
