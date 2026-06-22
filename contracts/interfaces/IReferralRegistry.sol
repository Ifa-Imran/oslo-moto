// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReferralRegistry {
    function directReferrer(address user) external view returns (address);
    function registerReferral(address user, address referrer) external;
    function getUpline(address user, uint256 level) external view returns (address);
    function getDirectDownlines(address user) external view returns (address[] memory);
    function getDirectDownlineCount(address user) external view returns (uint256);
    function getTeamSize(address user) external view returns (uint256);
}
