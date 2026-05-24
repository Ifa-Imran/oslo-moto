// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITreasury {
    function receiveFees(uint256 amount) external;
    function distribute() external;
    function totalReceived() external view returns (uint256);
}
