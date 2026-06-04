// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeRouterV2
/// @notice Receives $1 USDT from referral and IMMEDIATELY forwards to DEX.
///         No manual flush needed — fully automatic.
/// @dev The USDT lands in DEX's actual balance. Admin can periodically sync
///      DEX reserves (drainUSDT all → injectUSDTLiquidity all) to update tracking.
contract FeeRouterV2 {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    address public immutable admin;
    address public dex;

    event FeeForwarded(address indexed from, uint256 amount, address indexed dex);
    event DexUpdated(address indexed newDex);

    error OnlyAdmin();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address _usdt, address _dex) {
        if (_usdt == address(0) || _dex == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        admin = msg.sender;
        dex = _dex;
    }

    /// @notice Called by referral contract during registration.
    ///         Pulls USDT from caller and IMMEDIATELY forwards to DEX.
    /// @param amount Amount of USDT to inject (typically 1e18 = $1)
    function injectUSDTLiquidity(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        // Pull USDT from referral contract
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        // Immediately forward to DEX — no holding
        usdt.safeTransfer(dex, amount);
        emit FeeForwarded(msg.sender, amount, dex);
    }

    /// @notice Update DEX address if needed
    function setDex(address _dex) external onlyAdmin {
        if (_dex == address(0)) revert ZeroAddress();
        dex = _dex;
        emit DexUpdated(_dex);
    }

    /// @notice Rescue any stuck tokens (safety net)
    function rescue(address token, uint256 amount) external onlyAdmin {
        IERC20(token).safeTransfer(admin, amount);
    }
}
