// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOsloDEX {
    function getPrice() external view returns (uint256);
    function sellOslo(uint256 osloAmount) external;
    function depositLiquidity(uint256 usdtAmount, address osloRecipient) external;
}
