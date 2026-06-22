// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IOsloToken.sol";

/// @title RewardVault - Liquidity Buffer for OSLO and USDT
/// @notice Holds reserves and releases tokens on request from authorized contracts
contract RewardVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    IERC20 public immutable usdt;
    IOsloToken public immutable osloToken;

    event OSLOReleased(address indexed to, uint256 amount);
    event USDTReleased(address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();

    constructor(address _usdt, address _osloToken) {
        if (_usdt == address(0) || _osloToken == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloToken = IOsloToken(_osloToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Release OSLO tokens to a recipient
    /// @param to Recipient address
    /// @param amount Amount to release
    function releaseOSLO(address to, uint256 amount) external onlyRole(ENGINE_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (osloToken.balanceOf(address(this)) < amount) revert InsufficientBalance();
        
        osloToken.transfer(to, amount);
        emit OSLOReleased(to, amount);
    }

    /// @notice Release USDT tokens to a recipient
    /// @param to Recipient address
    /// @param amount Amount to release
    function releaseUSDT(address to, uint256 amount) external onlyRole(ENGINE_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usdt.balanceOf(address(this)) < amount) revert InsufficientBalance();
        
        usdt.safeTransfer(to, amount);
        emit USDTReleased(to, amount);
    }

    /// @notice Get OSLO balance held by the vault
    function osloBalance() external view returns (uint256) {
        return osloToken.balanceOf(address(this));
    }

    /// @notice Get USDT balance held by the vault
    function usdtBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }
}
