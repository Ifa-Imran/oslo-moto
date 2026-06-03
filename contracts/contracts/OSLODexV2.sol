// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IOSLODexV2.sol";

interface IOSLOTokenV2Burn {
    function burnWithCap(uint256 amount) external;
}

/// @title OSLODexV2
/// @notice Sell-only DEX for OSLO/USDT. 10% USD sell tax, 50% burn / 50% liquidity split.
/// @dev V3: Users can ONLY sell OSLO for USDT. Only the Vault contract can "buy" (deposit USDT, receive OSLO).
///      No public buy function. Price determined by constant-product AMM (xy=k).
contract OSLODexV2 is IOSLODexV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;

    address public admin;
    address public timelock;
    address public vault;        // Only address allowed to call processBuy/processWithdrawal
    bool public setupComplete;
    bool public liquidityInitialized;

    // Reserves
    uint256 public usdtReserve;
    uint256 public osloReserve;

    // Stats
    uint256 public totalVolumeUSDT;
    uint256 public totalSwaps;
    uint256 public totalBurned;
    uint256 public lastPrice; // Last trade price (USDT per OSLO, 18 decimals)

    // ─── Events ─────────────────────────────────────────────────────────
    event LiquidityInitialized(uint256 usdtAmount, uint256 osloAmount, uint256 initialPrice);
    event Sold(
        address indexed seller,
        uint256 osloIn,
        uint256 usdtOut,
        uint256 burned,
        uint256 toLiquidity,
        uint256 price
    );
    event BuyProcessed(uint256 usdtIn, uint256 osloOut, uint256 price);
    event WithdrawalProcessed(uint256 osloIn, uint256 usdtOut, address recipient);
    event OsloReplenished(uint256 amount);
    event PriceUpdated(uint256 newPrice);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error OnlyVault();
    error SetupAlreadyComplete();
    error LiquidityAlreadyInitialized();
    error LiquidityNotInitialized();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientReserve();
    error SlippageExceeded();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    modifier whenLiquidityInitialized() {
        if (!liquidityInitialized) revert LiquidityNotInitialized();
        _;
    }

    constructor(address _usdt, address _osloToken) {
        if (_usdt == address(0) || _osloToken == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloToken = IERC20(_osloToken);
        admin = msg.sender;
    }

    // ─── Setup ──────────────────────────────────────────────────────────

    /// @notice Configure the DEX with vault and timelock addresses
    function configure(address _vault, address _timelock) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
        timelock = _timelock;
    }

    /// @notice Finalize setup — admin renounced
    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        setupComplete = true;
        admin = address(0);
    }

    /// @notice Update vault address (post-setup, timelock only)
    function setVault(address _vault) external onlyTimelock {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
    }

    // ─── Initial Liquidity ──────────────────────────────────────────────

    /// @notice Add initial liquidity to the DEX (called once during deployment)
    /// @param usdtAmount USDT amount (should be 2,000 * 1e18)
    /// @param osloAmount OSLO amount (should be 100,000 * 1e18)
    function addInitialLiquidity(uint256 usdtAmount, uint256 osloAmount) external override onlyAdmin {
        if (liquidityInitialized) revert LiquidityAlreadyInitialized();
        if (usdtAmount == 0 || osloAmount == 0) revert ZeroAmount();

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);

        usdtReserve = usdtAmount;
        osloReserve = osloAmount;
        liquidityInitialized = true;

        // Calculate initial price
        lastPrice = (usdtAmount * 1e18) / osloAmount;

        emit LiquidityInitialized(usdtAmount, osloAmount, lastPrice);
        emit PriceUpdated(lastPrice);
    }

    // ─── Public Sell Function (Sell-Only) ────────────────────────────────

    /// @notice Sell OSLO for USDT. 10% USD tax applied.
    /// @dev Token split: 50% of incoming tokens burned, 50% added to pool.
    ///      User receives 90% of AMM-calculated USDT output.
    /// @param osloAmount Amount of OSLO to sell
    /// @param minUSDTOut Minimum USDT to receive (slippage protection)
    /// @return toUser Amount of USDT received by seller
    function sellOSLO(uint256 osloAmount, uint256 minUSDTOut)
        external override nonReentrant whenLiquidityInitialized returns (uint256 toUser)
    {
        if (osloAmount == 0) revert ZeroAmount();

        // Transfer OSLO from seller to DEX
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);

        // Calculate USDT output using constant-product formula (full amount)
        uint256 usdtOut = (osloAmount * usdtReserve) / (osloReserve + osloAmount);
        if (usdtOut == 0) revert ZeroAmount();

        // Apply 10% sell tax — user gets 90%
        toUser = (usdtOut * (OSLOConstants.BASIS_POINTS - OSLOConstants.SELL_TAX_BP)) / OSLOConstants.BASIS_POINTS;
        if (toUser < minUSDTOut) revert SlippageExceeded();
        if (toUser > usdtReserve) revert InsufficientReserve();

        // Update USDT reserve: only deduct what goes to user (10% tax stays in pool)
        usdtReserve -= toUser;

        // Token split: 50% burned, 50% added to OSLO reserve
        uint256 toBurn = osloAmount / 2;
        uint256 toLiquidity = osloAmount - toBurn; // Handles odd amounts

        // Burn 50% of tokens
        if (toBurn > 0) {
            osloToken.safeTransfer(OSLOConstants.DEAD_ADDRESS, toBurn);
            totalBurned += toBurn;
        }

        // Add 50% to OSLO reserve
        osloReserve += toLiquidity;

        // Send USDT to seller
        usdt.safeTransfer(msg.sender, toUser);

        // Update stats
        totalVolumeUSDT += toUser;
        totalSwaps++;
        lastPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;

        emit Sold(msg.sender, osloAmount, toUser, toBurn, toLiquidity, lastPrice);
        emit PriceUpdated(lastPrice);
    }

    // ─── Vault-Only Functions ────────────────────────────────────────────

    /// @notice Process a buy from Vault: receive USDT, send OSLO to Vault
    /// @dev Called when users deposit USDT into the staking system.
    ///      USDT enters pool (increases reserve), OSLO exits to Vault.
    /// @param usdtAmount Amount of USDT to swap for OSLO
    /// @return osloOut Amount of OSLO sent to Vault
    function processBuy(uint256 usdtAmount)
        external override onlyVault nonReentrant whenLiquidityInitialized returns (uint256 osloOut)
    {
        if (usdtAmount == 0) revert ZeroAmount();

        // Pull USDT from Vault
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // Calculate OSLO output using constant-product formula
        osloOut = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount);
        if (osloOut == 0) revert ZeroAmount();
        if (osloToken.balanceOf(address(this)) < osloOut) revert InsufficientReserve();

        // Update reserves
        usdtReserve += usdtAmount;
        osloReserve -= osloOut;

        // Send OSLO to Vault
        osloToken.safeTransfer(msg.sender, osloOut);

        // Update stats
        totalVolumeUSDT += usdtAmount;
        totalSwaps++;
        lastPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;

        emit BuyProcessed(usdtAmount, osloOut, lastPrice);
        emit PriceUpdated(lastPrice);
    }

    /// @notice Process a withdrawal: receive OSLO from Vault, send USDT to recipient
    /// @dev Used for early exits. No sell tax applied (protocol operation).
    /// @param osloAmount Amount of OSLO being returned to DEX
    /// @param recipient Address to receive USDT
    /// @return usdtOut Amount of USDT sent to recipient
    function processWithdrawal(uint256 osloAmount, address recipient)
        external override onlyVault nonReentrant whenLiquidityInitialized returns (uint256 usdtOut)
    {
        if (osloAmount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        // Pull OSLO from Vault
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);

        // Calculate USDT output using constant-product formula (no tax)
        usdtOut = (osloAmount * usdtReserve) / (osloReserve + osloAmount);
        if (usdtOut == 0) revert ZeroAmount();
        if (usdtOut > usdtReserve) revert InsufficientReserve();

        // Update reserves
        osloReserve += osloAmount;
        usdtReserve -= usdtOut;

        // Send USDT to recipient
        usdt.safeTransfer(recipient, usdtOut);

        // Update stats
        totalVolumeUSDT += usdtOut;
        totalSwaps++;
        lastPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;

        emit WithdrawalProcessed(osloAmount, usdtOut, recipient);
        emit PriceUpdated(lastPrice);
    }

    /// @notice Replenish DEX OSLO reserve from Vault
    /// @dev Called by Vault when DEX runs low on OSLO from deposit buys
    /// @param osloAmount Amount of OSLO to add to reserves
    function replenishOsloReserve(uint256 osloAmount) external override onlyVault {
        if (osloAmount == 0) revert ZeroAmount();
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);
        osloReserve += osloAmount;
        emit OsloReplenished(osloAmount);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    /// @notice Get current OSLO price in USDT
    /// @return Price in USDT per OSLO (18 decimals)
    function getPrice() external view override returns (uint256) {
        if (osloReserve == 0 || usdtReserve == 0) return 0;
        return (usdtReserve * 1e18) / osloReserve;
    }

    /// @notice Quote: how much OSLO for a given USDT input (buy quote)
    /// @param usdtAmount Input USDT amount
    /// @return osloAmount Expected OSLO output
    function getOSLOForUSDT(uint256 usdtAmount) external view override returns (uint256 osloAmount) {
        if (usdtAmount == 0 || usdtReserve == 0 || osloReserve == 0) return 0;
        osloAmount = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount);
    }

    /// @notice Quote: how much USDT for selling OSLO (after 10% tax)
    /// @param osloAmount Input OSLO amount
    /// @return usdtAmount Expected USDT output (after tax)
    function getUSDTForOSLO(uint256 osloAmount) external view override returns (uint256 usdtAmount) {
        if (osloAmount == 0 || usdtReserve == 0 || osloReserve == 0) return 0;
        uint256 rawOut = (osloAmount * usdtReserve) / (osloReserve + osloAmount);
        // Apply 10% tax
        usdtAmount = (rawOut * (OSLOConstants.BASIS_POINTS - OSLOConstants.SELL_TAX_BP)) / OSLOConstants.BASIS_POINTS;
    }

    /// @notice Get reserves
    /// @return USDT reserve and OSLO reserve
    function getReserves() external view override returns (uint256, uint256) {
        return (usdtReserve, osloReserve);
    }

    // ─── Admin Drain (emergency) ────────────────────────────────────────

    /// @notice Drain USDT from DEX (admin only, pre-setup)
    /// @param amount Amount to drain (0 = all)
    function drainUSDT(uint256 amount) external onlyAdmin {
        uint256 bal = usdt.balanceOf(address(this));
        uint256 toDrain = amount == 0 ? bal : amount;
        if (toDrain == 0) revert ZeroAmount();
        if (toDrain > bal) toDrain = bal;

        if (toDrain >= usdtReserve) {
            usdtReserve = 0;
        } else {
            usdtReserve -= toDrain;
        }

        usdt.safeTransfer(msg.sender, toDrain);
    }
}
