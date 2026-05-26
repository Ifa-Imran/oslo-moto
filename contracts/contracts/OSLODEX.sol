// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";
import "./interfaces/IOSLODEX.sol";

/// @title OSLODEX
/// @notice Custom DEX for OSLO/USDT trading. Protocol-controlled liquidity.
/// @dev V2: USDT-based. Price = USDT reserve / OSLO total supply.
contract OSLODEX is IOSLODEX, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────

    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;

    address public admin;
    address public timelock;
    address public liquidityManager;
    address public investmentEngine;   // Authorized to call processDeposit/processWithdrawal
    address public referralContract;    // Authorized to call swapUSDTForOSLO (registration fees)
    bool public setupComplete;

    // Reserves
    uint256 public usdtReserve;
    uint256 public osloReserve;

    // Stats
    uint256 public totalVolumeUSDT;
    uint256 public totalSwaps;
    uint256 public lastPrice; // Last trade price (USDT per OSLO, 18 decimals)

    // ─── Events ─────────────────────────────────────────────────────────
    event LiquidityDeposited(uint256 usdtAmount, uint256 osloAmount);
    event Swapped(
        address indexed user,
        bool usdtToOslo,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 price
    );
    event PriceUpdated(uint256 newPrice);
    event DepositProcessed(uint256 usdtIn, uint256 osloOut);
    event WithdrawalProcessed(uint256 osloIn, uint256 usdtOut, address recipient);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error OnlyLiquidityManager();
    error OnlyInvestmentEngine();
    error OnlyReferralOrIE();
    error SetupAlreadyComplete();
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

    modifier onlyLiquidityManager() {
        if (msg.sender != liquidityManager) revert OnlyLiquidityManager();
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

    function configure(address _timelock, address _liquidityManager, address _investmentEngine) external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        timelock = _timelock;
        liquidityManager = _liquidityManager;
        investmentEngine = _investmentEngine;
        setupComplete = true;
    }

    function completeSetup() external onlyAdmin {
        if (setupComplete) revert SetupAlreadyComplete();
        setupComplete = true;
        admin = address(0);
    }

    /// @notice Update the InvestmentEngine address. Only callable by Timelock.
    /// @param _investmentEngine New InvestmentEngine address
    function setInvestmentEngine(address _investmentEngine) external onlyTimelock {
        if (_investmentEngine == address(0)) revert ZeroAddress();
        investmentEngine = _investmentEngine;
    }

    /// @notice Force-update InvestmentEngine address. Only callable by Admin (pre-setup).
    /// @dev Used when redeploying IE before completeSetup is called.
    function forceSetInvestmentEngine(address _investmentEngine) external onlyAdmin {
        if (_investmentEngine == address(0)) revert ZeroAddress();
        investmentEngine = _investmentEngine;
    }

    /// @notice Set the Referral contract address. Only callable by Timelock after setup.
    /// @param _referralContract New Referral contract address
    function setReferralContract(address _referralContract) external onlyTimelock {
        if (_referralContract == address(0)) revert ZeroAddress();
        referralContract = _referralContract;
    }

    /// @notice Force-set Referral contract address. Only callable by Admin (pre-setup).
    /// @dev Used during initial deployment wiring.
    function forceSetReferralContract(address _referralContract) external onlyAdmin {
        if (_referralContract == address(0)) revert ZeroAddress();
        referralContract = _referralContract;
    }

    // ─── Liquidity Management (Protocol-Controlled Only) ────────────────

    /// @notice Add initial liquidity to the DEX (called once during deployment)
    /// @param usdtAmount USDT amount
    /// @param osloAmount OSLO amount
    function addInitialLiquidity(uint256 usdtAmount, uint256 osloAmount) external onlyLiquidityManager {
        if (usdtAmount == 0 || osloAmount == 0) revert ZeroAmount();

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);

        usdtReserve += usdtAmount;
        osloReserve += osloAmount;

        // Calculate initial price
        lastPrice = (usdtAmount * 1e18) / osloAmount;

        emit LiquidityDeposited(usdtAmount, osloAmount);
        emit PriceUpdated(lastPrice);
    }

    /// @notice Add more USDT liquidity from protocol fees.
    /// @param usdtAmount USDT amount to add
    function addLiquidityFromFees(uint256 usdtAmount) external onlyLiquidityManager {
        if (usdtAmount == 0) revert ZeroAmount();

        // Transfer USDT from LiquidityManager
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        usdtReserve += usdtAmount;

        uint256 newPrice = (usdtReserve * 1e18) / osloToken.totalSupply();
        emit LiquidityDeposited(usdtAmount, 0);
        emit PriceUpdated(newPrice);
    }

    /// @notice Inject USDT directly into DEX liquidity without removing OSLO.
    /// @dev Called by Referral contract for $1 registration fees.
    ///      USDT goes straight to reserves — no OSLO is taken out.
    /// @param usdtAmount Amount of USDT to inject as pure liquidity
    function injectUSDTLiquidity(uint256 usdtAmount) external {
        if (msg.sender != referralContract) revert OnlyReferralOrIE();
        if (usdtAmount == 0) revert ZeroAmount();

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        usdtReserve += usdtAmount;

        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        emit LiquidityDeposited(usdtAmount, 0);
        emit PriceUpdated(newPrice);
    }

    // ─── Investment Engine Protocol Functions ───────────────────────────

    /// @notice Process a deposit from InvestmentEngine: receive USDT, send OSLO to IE.
    /// @dev USDT must already be transferred to this contract (caller approves + transfers).
    ///      OSLO is sent to the caller (InvestmentEngine) from DEX reserves.
    /// @param usdtAmount Amount of USDT being deposited
    /// @return osloAmount Amount of OSLO sent to InvestmentEngine
    function processDeposit(uint256 usdtAmount) external override onlyInvestmentEngine nonReentrant returns (uint256 osloAmount) {
        if (usdtAmount == 0) revert ZeroAmount();

        // USDT should already be transferred by caller; pull from caller via transferFrom
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // Calculate OSLO to send back based on current DEX reserves
        // Constant-product-like: osloAmount = usdtAmount * osloReserve / (usdtReserve + usdtAmount)
        if (usdtReserve > 0 && osloReserve > 0) {
            osloAmount = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount);
        } else {
            // Fallback: use initial price ratio if reserve is empty
            osloAmount = usdtAmount; // 1:1 if no price yet
        }

        if (osloAmount == 0) revert ZeroAmount();
        if (osloToken.balanceOf(address(this)) < osloAmount) revert InsufficientReserve();

        // Update reserves
        usdtReserve += usdtAmount;
        osloReserve -= osloAmount;

        // Send OSLO to InvestmentEngine
        osloToken.safeTransfer(msg.sender, osloAmount);

        // Update price: USDT per OSLO (18 decimals)
        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        totalVolumeUSDT += usdtAmount;
        totalSwaps++;

        emit DepositProcessed(usdtAmount, osloAmount);
        emit PriceUpdated(newPrice);
    }

    /// @notice Process a withdrawal from InvestmentEngine: receive OSLO from IE, send USDT to recipient.
    /// @dev OSLO must already be transferred to this contract.
    /// @param osloAmount Amount of OSLO being returned
    /// @param recipient Address to receive USDT
    /// @return usdtAmount Amount of USDT sent to recipient
    function processWithdrawal(uint256 osloAmount, address recipient)
        external override onlyInvestmentEngine nonReentrant returns (uint256 usdtAmount)
    {
        if (osloAmount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        // Pull OSLO from InvestmentEngine
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);

        // Calculate USDT to return based on current DEX reserves
        if (usdtReserve > 0 && osloReserve > 0) {
            usdtAmount = (osloAmount * usdtReserve) / (osloReserve + osloAmount);
        } else {
            usdtAmount = osloAmount; // 1:1 fallback
        }

        if (usdtAmount == 0) revert ZeroAmount();
        if (usdtAmount > usdtReserve) revert InsufficientReserve();

        // Update reserves
        osloReserve += osloAmount;
        usdtReserve -= usdtAmount;

        // Send USDT to recipient
        usdt.safeTransfer(recipient, usdtAmount);

        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        totalVolumeUSDT += usdtAmount;
        totalSwaps++;

        emit WithdrawalProcessed(osloAmount, usdtAmount, recipient);
        emit PriceUpdated(newPrice);
    }

    // ─── Yield Auto-Buy (Tax-Free) ────────────────────────────────────

    /// @notice Tax-free swap of USDT for OSLO — only callable by InvestmentEngine.
    /// @dev Used when claiming yield: yield USDT auto-buys OSLO at DEX rate with zero fee.
    ///      OSLO is sent directly to the recipient (the investor).
    /// @param usdtAmount Amount of USDT to swap (from IE's accumulated fees)
    /// @param recipient Address to receive OSLO tokens
    /// @return osloAmount Amount of OSLO sent to recipient
    function swapYieldForOSLO(uint256 usdtAmount, address recipient)
        external onlyInvestmentEngine nonReentrant returns (uint256 osloAmount)
    {
        if (usdtAmount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (usdtReserve == 0 || osloReserve == 0) revert InsufficientReserve();

        // Constant product pricing — NO fee applied (tax-free yield buy)
        osloAmount = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount);
        if (osloAmount == 0) revert ZeroAmount();

        // Pull USDT from InvestmentEngine
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // Send OSLO directly to the investor
        osloToken.safeTransfer(recipient, osloAmount);

        // Update reserves: USDT enters DEX (↑ liquidity), OSLO leaves DEX
        usdtReserve += usdtAmount;
        osloReserve -= osloAmount;

        // Update stats
        totalVolumeUSDT += usdtAmount;
        totalSwaps++;

        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        emit Swapped(recipient, true, usdtAmount, osloAmount, newPrice);
        emit PriceUpdated(newPrice);
    }

    // ─── Public Swap Functions ─────────────────────────────────────────

    /// @notice Swap USDT for OSLO — restricted to InvestmentEngine & Referral.
    /// @dev Called by InvestmentEngine for protocol ops and by Referral for
    ///      registration fee → liquidity routing (OSLO burned, USDT becomes LP).
    ///      Regular users cannot swap USDT→OSLO.
    /// @param usdtAmount Amount of USDT to swap
    /// @param minOsloAmount Minimum OSLO to receive (slippage protection)
    /// @return osloAmount Amount of OSLO received
    function swapUSDTForOSLO(uint256 usdtAmount, uint256 minOsloAmount)
        external nonReentrant returns (uint256 osloAmount) {
        if (msg.sender != investmentEngine && msg.sender != referralContract) revert OnlyReferralOrIE();
        if (usdtAmount == 0) revert ZeroAmount();
        if (usdtReserve == 0 || osloReserve == 0) revert InsufficientReserve();

        osloAmount = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount);

        if (osloAmount == 0 || osloAmount < minOsloAmount) revert SlippageExceeded();

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        osloToken.safeTransfer(msg.sender, osloAmount);

        usdtReserve += usdtAmount;
        osloReserve -= osloAmount;

        totalVolumeUSDT += usdtAmount;
        totalSwaps++;

        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        emit Swapped(msg.sender, true, usdtAmount, osloAmount, newPrice);
        emit PriceUpdated(newPrice);
    }

    /// @notice Swap OSLO for USDT
    /// @dev V6: 10% sell tax burned via OSLOToken._update.
    ///      Of the remaining 90% received by DEX:
    ///        20% → additionally burned (deflationary)
    ///        70% → InvestmentEngine (contract reserve, recycled for rewards)
    ///        10% → stays in DEX as LP
    ///      Total burn = 30% of declared OSLO.
    ///      USDT output calculated on full osloReceived (90%) for fair user price.
    /// @param osloAmount Amount of OSLO to swap
    /// @param minUSDTAmount Minimum USDT to receive (slippage protection)
    /// @return usdtAmount Amount of USDT received
    function swapOSLOForUSDT(uint256 osloAmount, uint256 minUSDTAmount) external nonReentrant returns (uint256 usdtAmount) {
        if (osloAmount == 0) revert ZeroAmount();
        if (usdtReserve == 0 || osloReserve == 0) revert InsufficientReserve();

        // Transfer OSLO from user to DEX — OSLOToken._update burns 10% as sell tax.
        // DEX receives ~90% of osloAmount.
        uint256 osloBefore = osloToken.balanceOf(address(this));
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);
        uint256 osloReceived = osloToken.balanceOf(address(this)) - osloBefore;

        // Calculate USDT output using the full osloReceived (90%).
        // The user gets USDT for the full 90% — distribution happens after.
        usdtAmount = (osloReceived * usdtReserve) / (osloReserve + osloReceived);

        if (usdtAmount == 0 || usdtAmount < minUSDTAmount) revert SlippageExceeded();
        if (usdtAmount > usdtReserve) revert InsufficientReserve();

        // Send USDT to user
        usdtReserve -= usdtAmount;
        usdt.safeTransfer(msg.sender, usdtAmount);

        // ── Distribute received OSLO ──────────────────────────────────
        // Uses OSLOConstants pre-defined basis points:
        //   SELL_TAX_TO_BURN_BP (2000) = 20% of osloReceived → burned
        //   SELL_TAX_TO_CONTRACT_BP (7000) = 70% of osloReceived → InvestmentEngine
        //   Remaining (1000) = 10% of osloReceived → DEX LP
        uint256 additionalBurn = (osloReceived * OSLOConstants.SELL_TAX_TO_BURN_BP) / OSLOConstants.BASIS_POINTS;
        uint256 toIE = (osloReceived * OSLOConstants.SELL_TAX_TO_CONTRACT_BP) / OSLOConstants.BASIS_POINTS;
        uint256 toLP = osloReceived - additionalBurn - toIE;

        // Burn 20% of received OSLO (deflationary)
        if (additionalBurn > 0) {
            osloToken.safeTransfer(OSLOConstants.DEAD_ADDRESS, additionalBurn);
        }

        // Send 70% to InvestmentEngine (recycled for future rewards)
        if (toIE > 0) {
            if (investmentEngine == address(0)) revert ZeroAddress();
            osloToken.safeTransfer(investmentEngine, toIE);
        }

        // Keep 10% in DEX as LP
        osloReserve += toLP;

        totalVolumeUSDT += usdtAmount;
        totalSwaps++;

        uint256 newPrice = osloReserve > 0 ? (usdtReserve * 1e18) / osloReserve : 0;
        emit Swapped(msg.sender, false, osloAmount, usdtAmount, newPrice);
        emit PriceUpdated(newPrice);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    /// @notice Get current OSLO price in USDT
    /// @return Price in USDT per OSLO (18 decimals)
    function getPrice() external view returns (uint256) {
        if (osloReserve == 0 || usdtReserve == 0) return 0;
        return (usdtReserve * 1e18) / osloReserve;
    }

    /// @notice Calculate OSLO output for a given USDT input at current price
    /// @param usdtAmount Input USDT amount
    /// @return Expected OSLO output
    function getUSDTForOSLOOutput(uint256 usdtAmount) external view returns (uint256) {
        if (usdtAmount == 0 || usdtReserve == 0 || osloReserve == 0) return 0;
        if (usdtAmount >= usdtReserve) return osloReserve; // cap: can't withdraw more than reserve
        return (usdtAmount * osloReserve) / (usdtReserve - usdtAmount);
    }

    /// @notice Calculate USDT output for a given OSLO input (after 10% sell tax)
    /// @param osloAmount Input OSLO amount (declared by user)
    /// @return Expected USDT output after 10% tax is applied
    function getOSLOForUSDTOutput(uint256 osloAmount) external view returns (uint256) {
        if (osloAmount == 0 || usdtReserve == 0 || osloReserve == 0) return 0;
        // Account for 10% sell tax: only 90% of OSLO reaches the DEX
        uint256 netOslo = osloAmount - (osloAmount * OSLOConstants.SELL_TAX_BP) / OSLOConstants.BASIS_POINTS;
        uint256 usdtAmount = (netOslo * usdtReserve) / (osloReserve + netOslo);
        if (usdtAmount > usdtReserve) return 0;
        return usdtAmount;
    }

    /// @notice Receive OSLO from InvestmentEngine to replenish DEX reserves.
    /// @dev Called by InvestmentEngine when DEX OSLO is depleted from deposits.
    /// @param osloAmount Amount of OSLO to add to reserves
    function replenishOsloReserve(uint256 osloAmount) external onlyInvestmentEngine {
        if (osloAmount == 0) revert ZeroAmount();
        osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);
        osloReserve += osloAmount;
    }

    /// @notice Get reserves
    /// @return _usdtRes USDT reserve
    /// @return _osloRes OSLO reserve
    function getReserves() external view returns (uint256 _usdtRes, uint256 _osloRes) {
        return (usdtReserve, osloReserve);
    }
}
