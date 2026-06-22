// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILeadershipBonus {
    /// @notice Record staking volume up the referral tree for the current week
    /// @param staker The user who staked
    /// @param amount The stake amount in USDT (6 decimals)
    function recordStakeVolume(address staker, uint256 amount) external;
}
