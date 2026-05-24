// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOSLOToken
/// @notice V2: Fixed supply, no minting. 10% sell tax with deflationary mechanics.
interface IOSLOToken {
    function totalBurned() external view returns (uint256);
    function setSellTaxAddresses(address liquidityManager) external;
    function setTaxWhitelist(address account, bool whitelisted) external;
    function isTaxWhitelisted(address account) external view returns (bool);
    function setSellEndpoint(address endpoint, bool status) external;
    function isSellEndpoint(address endpoint) external view returns (bool);
}
