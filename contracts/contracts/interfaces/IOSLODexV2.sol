// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOSLODexV2
/// @notice Interface for the new OSLO DEX V2 (sell-only for users, vault-only buy)
interface IOSLODexV2 {
    /// @notice Add initial liquidity to the DEX (admin-only, one-time)
    /// @param usdtAmount USDT amount to seed
    /// @param osloAmount OSLO amount to seed
    function addInitialLiquidity(uint256 usdtAmount, uint256 osloAmount) external;

    /// @notice Sell OSLO for USDT (public, anyone can sell)
    /// @dev 10% USD tax applied; 50% of tokens burned, 50% back to pool
    /// @param osloAmount Amount of OSLO to sell
    /// @param minUSDTOut Minimum USDT to receive (slippage protection)
    /// @return usdtOut Amount of USDT received by seller (after 10% tax)
    function sellOSLO(uint256 osloAmount, uint256 minUSDTOut) external returns (uint256 usdtOut);

    /// @notice Process a buy from Vault: receive USDT, send OSLO to Vault
    /// @dev Only callable by the Vault contract
    /// @param usdtAmount Amount of USDT being deposited
    /// @return osloAmount Amount of OSLO sent to Vault
    function processBuy(uint256 usdtAmount) external returns (uint256 osloAmount);

    /// @notice Process a withdrawal: receive OSLO from Vault, send USDT to recipient
    /// @dev Only callable by the Vault contract. No sell tax applied.
    /// @param osloAmount Amount of OSLO being returned
    /// @param recipient Address to receive USDT
    /// @return usdtAmount Amount of USDT sent to recipient
    function processWithdrawal(uint256 osloAmount, address recipient) external returns (uint256 usdtAmount);

    /// @notice Replenish DEX OSLO reserve from Vault
    /// @dev Only callable by the Vault contract
    /// @param osloAmount Amount of OSLO to add to reserves
    function replenishOsloReserve(uint256 osloAmount) external;

    /// @notice Get current OSLO price in USDT
    /// @return Price in USDT per OSLO (18 decimals)
    function getPrice() external view returns (uint256);

    /// @notice Quote: how much OSLO would you get for a given USDT buy amount
    /// @param usdtAmount Input USDT amount
    /// @return osloAmount Expected OSLO output
    function getOSLOForUSDT(uint256 usdtAmount) external view returns (uint256 osloAmount);

    /// @notice Quote: how much USDT would you get for selling OSLO (after 10% tax)
    /// @param osloAmount Input OSLO amount
    /// @return usdtAmount Expected USDT output (after tax)
    function getUSDTForOSLO(uint256 osloAmount) external view returns (uint256 usdtAmount);

    /// @notice Get current reserves
    /// @return usdtReserve USDT in pool
    /// @return osloReserve OSLO in pool
    function getReserves() external view returns (uint256 usdtReserve, uint256 osloReserve);
}
