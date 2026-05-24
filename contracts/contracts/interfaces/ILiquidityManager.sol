// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILiquidityManager {
    function addLiquidityFromFees(uint256 usdtAmount) external;
}
