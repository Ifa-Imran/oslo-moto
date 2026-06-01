// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DEXDrainer
/// @notice One-time helper to drain OSLO and USDT from old OSLODEX.
/// @dev Deploy → set as InvestmentEngine on DEX → call drain functions → rescue leftovers.
///      This contract must be set as the DEX's investmentEngine to call restricted functions.
interface IOSLODEXDrain {
    function swapYieldForOSLO(uint256 usdtAmount, address recipient) external returns (uint256);
    function processWithdrawal(uint256 osloAmount, address recipient) external returns (uint256);
    function getReserves() external view returns (uint256 usdtRes, uint256 osloRes);
}

contract DEXDrainer {
    using SafeERC20 for IERC20;

    address public immutable owner;
    IERC20 public immutable usdt;
    IERC20 public immutable osloToken;
    IOSLODEXDrain public immutable dex;

    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _usdt, address _osloToken, address _dex) {
        owner = msg.sender;
        usdt = IERC20(_usdt);
        osloToken = IERC20(_osloToken);
        dex = IOSLODEXDrain(_dex);
    }

    /// @notice Drain OSLO from DEX by swapping USDT in (tax-free yield swap).
    ///         OSLO is sent directly to the owner (deployer).
    /// @param usdtAmount Amount of USDT to use (must be pre-funded to this contract)
    function drainOSLO(uint256 usdtAmount) external onlyOwner returns (uint256 osloOut) {
        usdt.forceApprove(address(dex), usdtAmount);
        osloOut = dex.swapYieldForOSLO(usdtAmount, owner);
    }

    /// @notice Drain USDT from DEX by returning OSLO via processWithdrawal.
    ///         USDT is sent directly to the owner (deployer).
    /// @param osloAmount Amount of OSLO to return (must be pre-funded to this contract)
    function drainUSDT(uint256 osloAmount) external onlyOwner returns (uint256 usdtOut) {
        osloToken.forceApprove(address(dex), osloAmount);
        usdtOut = dex.processWithdrawal(osloAmount, owner);
    }

    /// @notice Rescue any tokens left in this contract back to owner.
    function rescue(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) {
            IERC20(token).safeTransfer(owner, bal);
        }
    }

    /// @notice Rescue BNB left in this contract.
    function rescueBNB() external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal > 0) {
            payable(owner).transfer(bal);
        }
    }

    receive() external payable {}
}
