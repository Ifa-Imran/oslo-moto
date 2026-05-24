// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOSLODEX
/// @notice Interface for OSLO DEX contract (V2: USDT-based)
interface IOSLODEX {
    /// @notice Add initial liquidity to the DEX
    /// @param usdtAmount USDT amount
    /// @param osloAmount OSLO amount
    function addInitialLiquidity(uint256 usdtAmount, uint256 osloAmount) external;

    /// @notice Add liquidity from protocol fees
    /// @param usdtAmount USDT amount to add
    function addLiquidityFromFees(uint256 usdtAmount) external;

    /// @notice Process a deposit from InvestmentEngine: receive USDT, send OSLO to IE
    /// @param usdtAmount USDT amount
    /// @return osloAmount OSLO sent to InvestmentEngine
    function processDeposit(uint256 usdtAmount) external returns (uint256 osloAmount);

    /// @notice Process a withdrawal from InvestmentEngine: receive OSLO from IE, send USDT to recipient
    /// @param osloAmount OSLO amount
    /// @param recipient Address to receive USDT
    /// @return usdtAmount USDT sent to recipient
    function processWithdrawal(uint256 osloAmount, address recipient) external returns (uint256 usdtAmount);

    /// @notice Swap USDT for OSLO
    /// @param usdtAmount Amount of USDT to swap
    /// @param minOsloAmount Minimum OSLO to receive
    /// @return osloAmount Amount of OSLO received
    function swapUSDTForOSLO(uint256 usdtAmount, uint256 minOsloAmount) external returns (uint256 osloAmount);

    /// @notice Swap OSLO for USDT
    /// @param osloAmount Amount of OSLO to swap
    /// @param minUSDTAmount Minimum USDT to receive
    /// @return usdtAmount Amount of USDT received
    function swapOSLOForUSDT(uint256 osloAmount, uint256 minUSDTAmount) external returns (uint256 usdtAmount);

    /// @notice Get current OSLO price in USDT
    /// @return Price in USDT per OSLO (18 decimals)
    function getPrice() external view returns (uint256);

    /// @notice Compute OSLO output for a given USDT input at current price
    /// @param usdtAmount Input USDT amount
    /// @return Expected OSLO output
    function getUSDTForOSLOOutput(uint256 usdtAmount) external view returns (uint256);

    /// @notice Compute USDT output for a given OSLO input at current price
    /// @param osloAmount Input OSLO amount
    /// @return Expected USDT output
    function getOSLOForUSDTOutput(uint256 osloAmount) external view returns (uint256);

    /// @notice Receive OSLO from InvestmentEngine to replenish DEX reserves
    /// @param osloAmount Amount of OSLO to add to reserves
    function replenishOsloReserve(uint256 osloAmount) external;

    /// @notice Get reserves
    /// @return usdtRes USDT reserve
    /// @return osloRes OSLO reserve
    function getReserves() external view returns (uint256 usdtRes, uint256 osloRes);
}
