// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInvestmentEngine {
    function getActiveDeposit(address user) external view returns (uint256);
    function getUserTier(address user) external view returns (uint256);
    function notifyLevelIncome(address user, uint256 amount) external;
    function notifyRankBonus(address user, uint256 amount) external;
}
