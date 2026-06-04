// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOSLOVault
/// @notice Interface for the OSLO Vault/Staking contract (consolidated pool model)
interface IOSLOVault {
    /// @notice Get total active deposit for a user (in USDT)
    function getActiveDeposit(address user) external view returns (uint256);

    /// @notice Get user's package tier (1 or 2) based on total balance
    function getUserTier(address user) external view returns (uint256);

    /// @notice Notify vault of level income for 3X cap tracking
    /// @param user The user receiving level income
    /// @param amount USDT-equivalent amount of commission earned
    function notifyLevelIncome(address user, uint256 amount) external;

    /// @notice Notify vault of rank bonus for 3X cap tracking
    /// @param user The user receiving rank bonus
    /// @param amount USDT-equivalent amount of bonus earned
    function notifyRankBonus(address user, uint256 amount) external;
}
