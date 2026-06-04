// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeRouter
/// @notice Collects $1 USDT registration fees from OSLOReferral contract.
///         Admin periodically flushes to DEX liquidity via injectUSDTLiquidity.
/// @dev The referral contract calls injectUSDTLiquidity on this contract.
///      This contract holds the USDT until admin flushes it to the real DEX.
contract FeeRouter {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    address public immutable admin;
    address public dex;

    event FeeReceived(address indexed from, uint256 amount);
    event FlushedToDex(uint256 amount);

    error OnlyAdmin();
    error ZeroAmount();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address _usdt, address _dex) {
        usdt = IERC20(_usdt);
        admin = msg.sender;
        dex = _dex;
    }

    /// @notice Called by referral contract during registration.
    ///         Referral does forceApprove(this, $1) then calls this function.
    ///         We pull USDT from referral contract and hold it.
    function injectUSDTLiquidity(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit FeeReceived(msg.sender, amount);
    }

    /// @notice Admin flushes accumulated USDT to DEX liquidity
    function flush() external onlyAdmin {
        uint256 bal = usdt.balanceOf(address(this));
        if (bal == 0) revert ZeroAmount();
        // Send to admin who then calls DEX.injectUSDTLiquidity
        usdt.safeTransfer(admin, bal);
        emit FlushedToDex(bal);
    }

    /// @notice Update DEX address if needed
    function setDex(address _dex) external onlyAdmin {
        dex = _dex;
    }
}
