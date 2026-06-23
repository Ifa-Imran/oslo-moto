// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ReferralRegistry - 20-Level Referral Tree
/// @notice Manages the referral tree structure with circular referral prevention
contract ReferralRegistry is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    IERC20 public immutable usdt;
    address public immutable osloDEX;

    uint256 public constant REGISTRATION_FEE = 1 * 1e18; // $1.00 USDT (18 decimals on BSC)

    mapping(address => address) public directReferrer;
    mapping(address => address[]) private _directDownlines;
    mapping(address => mapping(uint256 => address)) public uplineAtLevel;

    event ReferralRegistered(address indexed user, address indexed referrer);
    event UserSelfRegistered(address indexed user, address indexed referrer);
    event RegistrationFeePaid(address indexed user, uint256 amount, address indexed destination);

    error SelfReferral();
    error AlreadyRegistered();
    error CircularReferral();
    error ZeroAddress();
    error InsufficientAllowance();
    error InsufficientBalance();

    constructor(address _usdt, address _osloDEX) {
        if (_usdt == address(0) || _osloDEX == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        osloDEX = _osloDEX;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Allow a user to self-register with a referrer. Charges $1 USDT fee to OsloDEX.
    /// @param referrer The referrer address (can be address(0) for no referrer)
    function register(address referrer) external {
        address user = msg.sender;
        if (directReferrer[user] != address(0)) revert AlreadyRegistered();
        if (user == referrer) revert SelfReferral();

        // Collect $1 registration fee and send directly to OsloDEX (Liquidity Pool)
        if (usdt.allowance(user, address(this)) < REGISTRATION_FEE) revert InsufficientAllowance();
        if (usdt.balanceOf(user) < REGISTRATION_FEE) revert InsufficientBalance();
        usdt.safeTransferFrom(user, osloDEX, REGISTRATION_FEE);
        emit RegistrationFeePaid(user, REGISTRATION_FEE, osloDEX);

        if (referrer != address(0)) {
            if (!_isValidReferrer(referrer, user)) revert CircularReferral();
            directReferrer[user] = referrer;
            _directDownlines[referrer].push(user);

            // Build upline cache up to 20 levels
            address current = referrer;
            for (uint256 i = 1; i <= 20;) {
                if (current == address(0)) break;
                uplineAtLevel[user][i] = current;
                current = directReferrer[current];
                unchecked { ++i; }
            }
        } else {
            // Register with zero-address sentinel to mark as registered
            directReferrer[user] = address(1);
        }

        emit UserSelfRegistered(user, referrer);
    }

    /// @notice Check if a user is registered
    /// @param user The user to check
    /// @return True if registered
    function isRegistered(address user) external view returns (bool) {
        return directReferrer[user] != address(0);
    }

    /// @notice Register a referral relationship (engine only)
    /// @param user The new user being registered
    /// @param referrer The referrer (upline) of the new user
    function registerReferral(address user, address referrer) external onlyRole(ENGINE_ROLE) {
        if (user == address(0) || referrer == address(0)) revert ZeroAddress();
        if (user == referrer) revert SelfReferral();
        if (directReferrer[user] != address(0)) revert AlreadyRegistered();
        if (!_isValidReferrer(referrer, user)) revert CircularReferral();

        directReferrer[user] = referrer;
        _directDownlines[referrer].push(user);

        // Build upline cache up to 20 levels
        address current = referrer;
        for (uint256 i = 1; i <= 20;) {
            if (current == address(0)) break;
            uplineAtLevel[user][i] = current;
            current = directReferrer[current];
            unchecked { ++i; }
        }

        emit ReferralRegistered(user, referrer);
    }

    /// @notice Get the upline at a specific level
    /// @param user The user to query
    /// @param level The level (1-20)
    /// @return The upline address at that level
    function getUpline(address user, uint256 level) external view returns (address) {
        return uplineAtLevel[user][level];
    }

    /// @notice Get all direct downlines of a user
    /// @param user The user to query
    /// @return Array of direct downline addresses
    function getDirectDownlines(address user) external view returns (address[] memory) {
        return _directDownlines[user];
    }

    /// @notice Get the count of direct downlines
    /// @param user The user to query
    /// @return Count of direct downlines
    function getDirectDownlineCount(address user) external view returns (uint256) {
        return _directDownlines[user].length;
    }

    /// @notice Get the total team size (all downlines up to 20 levels)
    /// @param user The user to query
    /// @return Total number of downlines across all levels
    function getTeamSize(address user) external view returns (uint256) {
        return _countTeam(user, 20);
    }

    /// @notice Internal recursive team counter
    function _countTeam(address user, uint256 depth) internal view returns (uint256) {
        if (depth == 0) return 0;
        address[] memory downlines = _directDownlines[user];
        uint256 count = downlines.length;
        for (uint256 i = 0; i < downlines.length;) {
            count += _countTeam(downlines[i], depth - 1);
            unchecked { ++i; }
        }
        return count;
    }

    /// @notice Check if a referrer is valid (no circular references)
    /// @param referrer The proposed referrer
    /// @param user The user being registered
    /// @return True if referrer is valid
    function _isValidReferrer(address referrer, address user) internal view returns (bool) {
        address current = referrer;
        for (uint256 i = 0; i < 20;) {
            if (current == address(0)) return true;
            if (current == user) return false;
            current = directReferrer[current];
            unchecked { ++i; }
        }
        return true;
    }
}
