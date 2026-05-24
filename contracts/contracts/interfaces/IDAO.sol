// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDAO {
    function checkAndQualify(address user, uint256 teamSize) external;
    function isDAOMember(address user) external view returns (bool);
    function daoMemberCount() external view returns (uint256);
    function claimRoyalty() external;
    function receiveRoyaltyPool(uint256 amount) external;
    function recordMonthlyTurnover(uint256 amount) external;
}
