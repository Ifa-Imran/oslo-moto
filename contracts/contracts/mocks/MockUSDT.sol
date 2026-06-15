// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @dev Mock USDT token for testing on BSC Testnet
 * Allows anyone to mint tokens via faucet function
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private _decimals = 18;
    
    // Faucet limits
    uint256 public constant FAUCET_AMOUNT = 10000 * 10**18; // 10,000 USDT per claim
    uint256 public constant FAUCET_COOLDOWN = 24 hours;
    
    // Track last claim time
    mapping(address => uint256) public lastClaimTime;
    
    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10**18); // 1M initial supply to deployer
    }
    
    /**
     * @dev Faucet function - anyone can claim USDT once per 24 hours
     */
    function faucet() external {
        require(
            block.timestamp >= lastClaimTime[msg.sender] + FAUCET_COOLDOWN,
            "Please wait 24 hours before next claim"
        );
        
        lastClaimTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
    
    /**
     * @dev Owner can mint unlimited tokens
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Override decimals to match real USDT (6 decimals on mainnet, 18 for test)
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
    
    /**
     * @dev Set decimals (only owner, for testing flexibility)
     */
    function setDecimals(uint8 newDecimals) external onlyOwner {
        require(newDecimals == 6 || newDecimals == 18, "Must be 6 or 18");
        _decimals = newDecimals;
    }
    
    /**
     * @dev Force approve - wrapper for SafeERC20.forceApprove compatibility
     */
    function forceApprove(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }
}
