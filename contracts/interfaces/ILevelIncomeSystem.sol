// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILevelIncomeSystem {
    function distributeCommissions(address claimer, uint256 yieldAmount) external;
}
