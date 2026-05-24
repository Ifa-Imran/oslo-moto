// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRankSystem {
    function recordTurnover(address user, address leg, uint256 amount) external;
    function claimRankBonus() external;
    function getCurrentRank(address user) external view returns (uint256);
    function getWeeklyTurnover(address user, uint256 weekId) external view returns (uint256);
    function getLegTurnover(address user, uint256 weekId, address leg) external view returns (uint256);
    function getCurrentWeekId() external view returns (uint256);
    function isRankQualified(address user) external view returns (bool);
    function receiveBonusPool(uint256 amount) external;
}
