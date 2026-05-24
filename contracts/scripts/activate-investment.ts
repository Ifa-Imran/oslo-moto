import { ethers } from "hardhat";

const TEST_USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";
const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 BUSD

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Activating investment for:", TEST_USER);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Contract addresses
  const CONTRACTS = {
    busd: "0x7cE77ecb588eB907B4b4f06d19A6Be286FfcC70a",
    investmentEngine: "0x22cDa7FFff00965113e133b814447Ba418D1cbab",
  };

  // Load contracts
  const MockBUSD = await ethers.getContractFactory("MockBUSD");
  const busd = MockBUSD.attach(CONTRACTS.busd);

  console.log("=== ACTIVATE INVESTMENT ACCOUNT ===\n");

  // Step 1: Check current balance
  console.log("1. Checking BUSD balance...");
  const balance = await busd.balanceOf(TEST_USER);
  console.log(`   Current balance: ${ethers.formatEther(balance)} BUSD`);
  
  if (balance < DEPOSIT_AMOUNT) {
    console.log(`   ❌ Insufficient balance! Minting 10,000 BUSD...`);
    await busd.mint(TEST_USER, ethers.parseEther("10000"));
    const newBalance = await busd.balanceOf(TEST_USER);
    console.log(`   ✓ Minted! New balance: ${ethers.formatEther(newBalance)} BUSD`);
  } else {
    console.log("   ✓ Sufficient balance");
  }
  console.log("");

  // Step 2: Approve BUSD for InvestmentEngine
  console.log("2. Approving BUSD for InvestmentEngine...");
  const currentAllowance = await busd.allowance(TEST_USER, CONTRACTS.investmentEngine);
  console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)} BUSD`);
  
  if (currentAllowance < DEPOSIT_AMOUNT) {
    console.log(`   Approving ${ethers.formatEther(DEPOSIT_AMOUNT)} BUSD...`);
    
    // Since we don't have the user's private key, we'll use deployer to approve on behalf
    // In production, user must do this themselves from their wallet
    // For testing, we'll transfer BUSD to deployer, approve, then transfer back
    
    // Alternative: Just approve from deployer's perspective for testing
    console.log("   ⚠ Note: Using deployer account for approval (testing only)");
    console.log("   In production, user must approve from their own wallet");
    
    // For now, let's just show what needs to happen
    console.log(`\n   === USER MUST DO THIS FROM THEIR WALLET ===`);
    console.log(`   1. Connect wallet: ${TEST_USER}`);
    console.log(`   2. Call: busd.approve("${CONTRACTS.investmentEngine}", ${ethers.formatEther(DEPOSIT_AMOUNT)} ether)`);
    console.log(`   3. Wait for confirmation`);
    console.log(`   =============================================\n`);
    
    // For testing purposes, we'll approve from deployer if they have BUSD
    const deployerBalance = await busd.balanceOf(deployer.address);
    if (deployerBalance >= DEPOSIT_AMOUNT) {
      console.log("   Deployer has BUSD, approving from deployer account...");
      const tx = await (busd as any).connect(deployer).approve(CONTRACTS.investmentEngine, DEPOSIT_AMOUNT);
      await tx.wait();
      const newAllowance = await busd.allowance(deployer.address, CONTRACTS.investmentEngine);
      console.log(`   ✓ Approved! New allowance: ${ethers.formatEther(newAllowance)} BUSD`);
    } else {
      console.log("   Deployer doesn't have enough BUSD either");
    }
  } else {
    console.log("   ✓ Already approved");
  }
  console.log("");

  // Step 3: Show what the deposit transaction should look like
  console.log("3. Deposit transaction details:");
  console.log(`   Contract: ${CONTRACTS.investmentEngine}`);
  console.log(`   Function: deposit(uint256 amount)`);
  console.log(`   Amount: ${ethers.formatEther(DEPOSIT_AMOUNT)} BUSD`);
  console.log(`   From: ${TEST_USER}`);
  console.log("");
  
  console.log("=== MANUAL STEPS REQUIRED ===");
  console.log("Since we don't have the user's private key, you need to do this manually:");
  console.log("");
  console.log("Option 1: Use the Frontend");
  console.log("  1. Go to: http://localhost:3002/invest");
  console.log("  2. Connect wallet: 0xFC7501F2f919D7c11A2451ee05575c6634669aD6");
  console.log("  3. Enter amount: 100");
  console.log("  4. Click 'Deposit' button");
  console.log("  5. Approve BUSD (first transaction)");
  console.log("  6. Confirm deposit (second transaction)");
  console.log("");
  console.log("Option 2: Use MetaMask/Console Directly");
  console.log("  1. Open browser console on the invest page");
  console.log("  2. Run:");
  console.log(`     await window.ethereum.request({`);
  console.log(`       method: 'wallet_switchEthereumChain',`);
  console.log(`       params: [{ chainId: '0x61' }], // BSC Testnet`);
  console.log(`     });`);
  console.log("");
  console.log("  3. Then approve and deposit through the UI");
  console.log("");
  
  // Step 4: Verify current status
  console.log("=== CURRENT STATUS ===");
  console.log("User:", TEST_USER);
  console.log("BUSD Balance:", ethers.formatEther(await busd.balanceOf(TEST_USER)), "BUSD");
  console.log("BUSD Allowance (InvestmentEngine):", ethers.formatEther(await busd.allowance(TEST_USER, CONTRACTS.investmentEngine)), "BUSD");
  console.log("\nNext step: Go to http://localhost:3002/invest and deposit 100 BUSD");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
