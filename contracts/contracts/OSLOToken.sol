// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";

/// @title OSLOToken
/// @notice BEP-20 token with fixed supply and deflationary sell tax. No minting capability.
/// @dev 30% burn on sells (10% fee burn + 20% deflationary burn). 70% → InvestmentEngine. V2: mint removed.
contract OSLOToken is ERC20, ERC20Burnable, ReentrancyGuard {
    /// @notice Total tokens permanently burned
    uint256 public totalBurned;

    /// @notice Address of the liquidity manager (receives LP portion of sell tax)
    address public liquidityManager;

    /// @notice Address of the InvestmentEngine (receives contract portion of sell tax)
    address public investmentEngine;

    /// @notice Addresses exempt from sell tax (protocol contracts)
    mapping(address => bool) private _taxWhitelist;

    /// @notice Whether an address is a designated sell/withdraw point
    mapping(address => bool) public isSellEndpoint;

    /// @notice Address authorized to configure the token (transferred to Timelock after setup)
    address public admin;

    /// @notice Timelock — manages tax addresses after setup is complete
    address public timelock;

    /// @notice Whether initial setup is complete and admin is renounced
    bool public setupComplete;

    // ─── Events ─────────────────────────────────────────────────────────
    event SellTaxApplied(address indexed from, uint256 taxAmount, uint256 toLp, uint256 burned);
    event SetupCompleted();
    event SellEndpointSet(address indexed endpoint, bool status);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error SetupAlreadyComplete();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    modifier beforeSetupComplete() {
        if (setupComplete) revert SetupAlreadyComplete();
        _;
    }

    /// @notice Deploy with full supply minted to deployer. Distribution handled by deployment script.
    /// @dev 11,000,000 OSLO → InvestmentEngine, 100,000 OSLO → LiquidityManager for DEX seed.
    constructor() ERC20("OSLO Protocol", "OSLO") {
        admin = msg.sender;
        _mint(msg.sender, OSLOConstants.TOTAL_SUPPLY);
    }

    // ─── Admin Setup (pre-Timelock transfer) ────────────────────────────

    /// @notice Set the liquidity manager and investment engine addresses for sell tax routing
    /// @param _liquidityManager Address of the OSLOLiquidityManager contract
    /// @param _investmentEngine Address of the OSLOInvestmentEngine contract
    function setSellTaxAddresses(address _liquidityManager, address _investmentEngine) external onlyAdmin beforeSetupComplete {
        if (_liquidityManager == address(0) || _investmentEngine == address(0)) revert ZeroAddress();
        liquidityManager = _liquidityManager;
        investmentEngine = _investmentEngine;
    }

    /// @notice Whitelist an address from sell tax (for protocol contracts)
    /// @param account Address to whitelist/un-whitelist
    /// @param whitelisted Whether to whitelist or remove
    function setTaxWhitelist(address account, bool whitelisted) external onlyAdmin beforeSetupComplete {
        _taxWhitelist[account] = whitelisted;
    }

    /// @notice Mark an address as a sell endpoint (e.g., OSLODEX)
    /// @param endpoint The address to mark
    /// @param status Whether it is a sell endpoint
    function setSellEndpoint(address endpoint, bool status) external onlyAdmin beforeSetupComplete {
        isSellEndpoint[endpoint] = status;
        emit SellEndpointSet(endpoint, status);
    }

    /// @notice Set the Timelock that will manage tax configuration after setup completes.
    function setTimelock(address _timelock) external onlyAdmin beforeSetupComplete {
        if (_timelock == address(0)) revert ZeroAddress();
        timelock = _timelock;
    }

    /// @notice Finalize setup — no more admin changes possible. Call after Timelock transfer.
    function completeSetup() external onlyAdmin beforeSetupComplete {
        setupComplete = true;
        admin = address(0);
        emit SetupCompleted();
    }

    // ─── View Functions ─────────────────────────────────────────────────

    /// @notice Update the InvestmentEngine address. Only callable by Timelock after setup.
    /// @dev Used when redeploying InvestmentEngine with new features.
    function setInvestmentEngine(address _investmentEngine) external onlyTimelock {
        if (_investmentEngine == address(0)) revert ZeroAddress();
        investmentEngine = _investmentEngine;
        _taxWhitelist[_investmentEngine] = true;
    }

    /// @notice Check if an address is exempt from sell tax
    function isTaxWhitelisted(address account) external view returns (bool) {
        return _taxWhitelist[account];
    }

    // ─── Internal Transfer Override ─────────────────────────────────────

    /// @dev Override _update to apply sell tax when transferring to sell endpoints.
    /// In OZ v5, _update replaces _transfer as the virtual hook.
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        // No tax on mint/burn, whitelisted senders, or non-sell endpoints
        if (from == address(0) || to == address(0) || _taxWhitelist[from] || !isSellEndpoint[to] || liquidityManager == address(0)) {
            super._update(from, to, amount);
            return;
        }

        // Distribution on every sell/withdrawal (swap via DEX):
        // - 10% fee → burned (fee paid by burning tokens; USDT stays in DEX as liquidity)
        // - 70% of total → InvestmentEngine (contract reserve for rewards)
        // - 20% of total → burned (additional deflationary burn)
        // - Total burn per sell = 30% (until burn cap is reached)
        // - DEX receives 0 tokens; draws from InvestmentEngine via processDeposit

        // 10% fee → burned
        uint256 feeToBurn = (amount * OSLOConstants.SELL_TAX_BP) / OSLOConstants.BASIS_POINTS;

        // 70% → InvestmentEngine
        uint256 toContract = (amount * 7_000) / OSLOConstants.BASIS_POINTS;

        // 20% → additional burn (subject to burn cap)
        uint256 toBurn = (amount * 2_000) / OSLOConstants.BASIS_POINTS;

        // Total to burn = 10% fee + 20% deflationary = 30%
        uint256 totalToBurn = feeToBurn + toBurn;

        // Net to destination (DEX) = amount - totalToBurn - toContract = 0
        uint256 netToDestination = amount - totalToBurn - toContract;

        // Transfer net amount to destination (DEX receives 0 on sells)
        super._update(from, to, netToDestination);

        // Send to InvestmentEngine (contract reserve)
        if (toContract > 0 && investmentEngine != address(0)) {
            super._update(from, investmentEngine, toContract);
        }

        // Burn fee + deflationary burn — check burn cap (stop when 90% of supply is burned)
        uint256 actualBurn = 0;
        if (totalToBurn > 0) {
            uint256 burnCapacity = OSLOConstants.MAX_BURN_SUPPLY > totalBurned
                ? OSLOConstants.MAX_BURN_SUPPLY - totalBurned
                : 0;
            actualBurn = totalToBurn > burnCapacity ? burnCapacity : totalToBurn;
            if (actualBurn > 0) {
                super._update(from, OSLOConstants.DEAD_ADDRESS, actualBurn);
                totalBurned += actualBurn;
            }
            // Any excess over burn cap goes to InvestmentEngine
            if (totalToBurn > actualBurn && investmentEngine != address(0)) {
                super._update(from, investmentEngine, totalToBurn - actualBurn);
            }
        }

        emit SellTaxApplied(from, feeToBurn, 0, actualBurn);
    }
}
