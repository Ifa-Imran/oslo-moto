// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRewardVault {
    function releaseOSLO(address to, uint256 amount) external;
    function releaseUSDT(address to, uint256 amount) external;
}
