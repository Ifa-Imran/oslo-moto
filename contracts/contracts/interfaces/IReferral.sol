// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReferral {
    function register(address user, address referrer) external;
    function isRegistered(address user) external view returns (bool);
    function getReferrer(address user) external view returns (address);
    function getDirectReferrals(address user) external view returns (address[] memory);
    function getQualifiedDirectsCount(address user) external view returns (uint256);
    function getUnlockedLevels(address user) external view returns (uint256);
    function distributeReferralCommission(address user, uint256 profitAmount) external returns (uint256 totalDistributed);
    function checkAndUnlockLevels(address user) external;
    function getTeamSize(address user) external view returns (uint256);
    function claimReferralRewards() external;
}
