// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/OSLOConstants.sol";

/// @title OSLOTokenV2
/// @notice BEP-20 token with fixed supply and public burn. No built-in sell tax.
/// @dev V3: Sell tax is handled entirely at the DEX level (10% USD tax, 50/50 burn/liquidity).
///      This token has NO _update override — transfers are simple ERC20 transfers.
contract OSLOTokenV2 is ERC20, ERC20Burnable, ReentrancyGuard {
    /// @notice Total tokens permanently burned (via DEX sells)
    uint256 public totalBurned;

    /// @notice Address authorized to configure the token (renounced after setup)
    address public admin;

    /// @notice Timelock for post-setup governance
    address public timelock;

    /// @notice Whether initial setup is complete and admin is renounced
    bool public setupComplete;

    // ─── Events ─────────────────────────────────────────────────────────
    event SetupCompleted();
    event TokensBurned(address indexed burner, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────
    error OnlyAdmin();
    error OnlyTimelock();
    error SetupAlreadyComplete();
    error ZeroAddress();
    error BurnCapExceeded();

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

    /// @notice Deploy with full supply minted to deployer.
    /// @dev Distribution: 100K OSLO → DEX, 11M OSLO → Vault (handled by deployment script).
    constructor() ERC20("OSLO Protocol", "OSLO") {
        admin = msg.sender;
        _mint(msg.sender, OSLOConstants.TOTAL_SUPPLY);
    }

    // ─── Admin Setup ────────────────────────────────────────────────────

    /// @notice Set the Timelock address for post-setup governance.
    function setTimelock(address _timelock) external onlyAdmin beforeSetupComplete {
        if (_timelock == address(0)) revert ZeroAddress();
        timelock = _timelock;
    }

    /// @notice Finalize setup — no more admin changes possible.
    function completeSetup() external onlyAdmin beforeSetupComplete {
        setupComplete = true;
        admin = address(0);
        emit SetupCompleted();
    }

    // ─── Burn Functions ─────────────────────────────────────────────────

    /// @notice Burn tokens from DEX sell mechanism (called by DEX contract)
    /// @dev Anyone can burn their own tokens. DEX calls this for the 50% burn split.
    ///      Respects burn cap: stops burning when 90% of supply is burned.
    /// @param amount Amount of tokens to burn
    function burnWithCap(uint256 amount) external {
        if (amount == 0) return;

        // Check burn cap
        uint256 burnCapacity = OSLOConstants.MAX_BURN_SUPPLY > totalBurned
            ? OSLOConstants.MAX_BURN_SUPPLY - totalBurned
            : 0;

        uint256 actualBurn = amount > burnCapacity ? burnCapacity : amount;
        if (actualBurn == 0) return;

        // Transfer to dead address (permanent removal from circulation)
        _transfer(msg.sender, OSLOConstants.DEAD_ADDRESS, actualBurn);
        totalBurned += actualBurn;

        emit TokensBurned(msg.sender, actualBurn);
    }
}
