// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OsloToken - The Deflationary Asset
/// @notice ERC20 token with fixed supply of 11.1M, no minting after deployment
/// @dev Uses AccessControl for BURNER_ROLE management
contract OsloToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public constant TOTAL_SUPPLY = 11_100_000 * 1e18;

    /// @notice Minting is permanently disabled after construction
    error MintingDisabled();

    /// @param initialHolder Address to receive the total supply
    constructor(address initialHolder) ERC20("Oslo Token", "OSLO") {
        require(initialHolder != address(0), "Zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(initialHolder, TOTAL_SUPPLY);
    }

    /// @notice Burns tokens from a specified account (requires BURNER_ROLE)
    /// @param account The account to burn from
    /// @param amount The amount to burn
    function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
        _burn(account, amount);
    }

    /// @notice Burns tokens from the caller (requires BURNER_ROLE)
    /// @param amount The amount to burn
    function burn(uint256 amount) public override onlyRole(BURNER_ROLE) {
        _burn(msg.sender, amount);
    }

    /// @dev Supports AccessControl and ERC20 interfaces
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
