// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock PancakeSwap Router for testing — simulates swaps at 1:1 ratio
contract MockPancakeRouter {
    using SafeERC20 for IERC20;

    function factory() external pure returns (address) {
        return address(0);
    }

    function WETH() external pure returns (address) {
        return address(0);
    }

    /// @dev Mock swap: transfers tokenIn from sender, mints equivalent tokenOut to recipient
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 /* amountOutMin */,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external {
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        // In tests, the mock just transfers from its own balance (pre-funded)
        IERC20(path[1]).safeTransfer(to, amountIn); // 1:1 swap rate for testing
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 /* amountAMin */,
        uint256 /* amountBMin */,
        address to,
        uint256 /* deadline */
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountBDesired);
        return (amountADesired, amountBDesired, amountADesired); // Mock LP tokens
    }
}
