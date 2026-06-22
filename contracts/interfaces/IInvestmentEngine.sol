// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInvestmentEngine {
    function recordExternalEarning(address user, uint256 usdtAmount) external;
    function stakes(address user) external view returns (
        uint256 activeStake,
        uint256 totalEarnings,
        uint256 stakeStartTime,
        uint8 stakeDayIndex,
        uint8 tier,
        address referrer,
        bool isActive
    );
    function getTeamVolume(address user) external view returns (uint256);
    function totalProtocolTurnover() external view returns (uint256);
}
