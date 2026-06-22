// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IOsloToken.sol";

/// @title OsloDEX - One-Way Deflationary DEX (Sell-Only)
/// @notice Users can only sell OSLO for USDT. 50% of sold OSLO is burned, 50% retained.
/// @dev Price = usdtReserve / osloReserve. 10% sell tax stays in LP.
/// @dev When staking, engine deposits USDT and equivalent OSLO moves from DEX to vault.
contract OsloDEX is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    IOsloToken public immutable osloToken;
    IERC20 public immutable usdt;

    uint256 public usdtReserve;
    uint256 public osloReserve;
    uint256 public totalBurned;

    uint256 public constant TOTAL_SUPPLY = 11_100_000 * 1e18;
    uint256 public constant BURN_CAP = 9_990_000 * 1e18; // 90% of supply
    uint256 public constant MINIMUM_FLOOR = 1_110_000 * 1e18; // 10% of supply

    event SellExecuted(
        address indexed seller,
        uint256 osloAmount,
        uint256 usdtReceived,
        uint256 burned,
        uint256 retained,
        uint256 newPrice,
        uint256 timestamp
    );
    event BurnCapReached(uint256 totalBurned, uint256 timestamp);
    event LiquiditySeeded(uint256 usdtAmount, uint256 osloAmount);
    event LiquidityDeposited(address indexed from, address indexed osloRecipient, uint256 usdtAmount, uint256 osloTransferred, uint256 newPrice);

    error ZeroAmount();
    error BurnCapExceeded();
    error InsufficientLiquidity();

    constructor(address _osloToken, address _usdt) {
        require(_osloToken != address(0) && _usdt != address(0), "Zero address");
        osloToken = IOsloToken(_osloToken);
        usdt = IERC20(_usdt);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /// @notice Seed the DEX with initial liquidity (admin only, one-time)
    /// @param usdtAmount USDT amount to seed
    /// @param osloAmount OSLO amount already transferred to this contract
    function seedLiquidity(uint256 usdtAmount, uint256 osloAmount) external onlyRole(ADMIN_ROLE) {
        usdtReserve += usdtAmount;
        osloReserve += osloAmount;
        emit LiquiditySeeded(usdtAmount, osloAmount);
    }

    /// @notice Sell OSLO tokens for USDT
    /// @param osloAmount Amount of OSLO to sell
    function sellOslo(uint256 osloAmount) external nonReentrant whenNotPaused {
        if (osloAmount == 0) revert ZeroAmount();
        if (totalBurned >= BURN_CAP) revert BurnCapExceeded();

        // Transfer OSLO from user
        osloToken.transferFrom(msg.sender, address(this), osloAmount);

        // Calculate USDT value
        uint256 currentPrice = getPrice();
        uint256 usdtOut = (osloAmount * currentPrice) / 1e18;
        
        // 10% tax
        uint256 tax = usdtOut / 10;
        uint256 usdtToUser = usdtOut - tax;

        if (usdtToUser > usdt.balanceOf(address(this))) revert InsufficientLiquidity();

        // 50/50 split on OSLO
        uint256 burnAmount = osloAmount / 2;
        uint256 retainAmount = osloAmount - burnAmount;

        // Check burn cap
        if (totalBurned + burnAmount > BURN_CAP) {
            burnAmount = BURN_CAP - totalBurned;
            retainAmount = osloAmount - burnAmount;
        }

        // Execute burn
        if (burnAmount > 0) {
            osloToken.burn(burnAmount);
            totalBurned += burnAmount;
        }

        // Update reserves
        usdtReserve += tax; // Tax stays in LP
        usdtReserve -= usdtToUser; // Pay user
        osloReserve += retainAmount; // Retained half stays
        // Note: burned half is removed from existence

        // Send USDT to user
        usdt.safeTransfer(msg.sender, usdtToUser);

        // New price (should be higher due to deflation)
        uint256 newPrice = getPrice();

        emit SellExecuted(msg.sender, osloAmount, usdtToUser, burnAmount, retainAmount, newPrice, block.timestamp);

        if (totalBurned >= BURN_CAP) {
            emit BurnCapReached(totalBurned, block.timestamp);
        }
    }

    /// @notice Get the current OSLO price in USDT (18 decimals)
    /// @return Price = actual USDT balance / actual OSLO balance
    /// @dev Uses real token balances (not internal accounting) so price reflects ALL liquidity
    ///      including registration fees, staking deposits, and sell taxes.
    function getPrice() public view returns (uint256) {
        uint256 actualOslo = osloToken.balanceOf(address(this));
        if (actualOslo == 0) return 0;
        return (usdt.balanceOf(address(this)) * 1e18) / actualOslo;
    }

    /// @notice Deposit USDT liquidity and transfer equivalent OSLO to recipient (engine only)
    /// @dev Called by InvestmentEngine after sending staking USDT to DEX.
    ///      Calculates equivalent OSLO at current price and transfers to vault.
    /// @param usdtAmount The USDT amount deposited into the DEX
    /// @param osloRecipient Where to send the equivalent OSLO (typically RewardVault)
    function depositLiquidity(uint256 usdtAmount, address osloRecipient) external onlyRole(ENGINE_ROLE) {
        if (usdtAmount == 0) revert ZeroAmount();

        // Calculate equivalent OSLO at current price
        uint256 currentPrice = getPrice();
        require(currentPrice > 0, "DEX price is zero");

        // OSLO to transfer = usdtAmount * 1e18 / price
        uint256 osloToTransfer = (usdtAmount * 1e18) / currentPrice;

        // Check DEX has enough OSLO
        uint256 dexOsloBalance = osloToken.balanceOf(address(this));
        require(dexOsloBalance >= osloToTransfer, "Insufficient DEX OSLO");

        // Transfer OSLO from DEX to recipient (vault)
        osloToken.transfer(osloRecipient, osloToTransfer);

        // Update internal reserves
        usdtReserve += usdtAmount;
        osloReserve -= osloToTransfer;

        uint256 newPrice = getPrice();
        emit LiquidityDeposited(msg.sender, osloRecipient, usdtAmount, osloToTransfer, newPrice);
    }

    /// @notice Pause the DEX (emergency)
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the DEX
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
