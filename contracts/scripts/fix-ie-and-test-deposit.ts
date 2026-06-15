import { ethers } from "hardhat";

async function main() {
  console.log("🔧 Fixing InvestmentEngine - Adding OSLO Reserve\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const NEW_IE_ADDRESS = "0x6522745D648019360f96E13a54C8A1D8AAc2A3Ee";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const WALLET_ADDRESS = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const PRIVATE_KEY = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";

  // Check deployer OSLO balance
  console.log("💰 Step 1: Checking OSLO balance...\n");
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN_ADDRESS);
  
  const deployerBalance = await osloToken.balanceOf(deployer.address);
  console.log("  Deployer OSLO:", ethers.formatEther(deployerBalance));
  
  if (deployerBalance < ethers.parseEther("5000000")) {
    console.log("  ⚠️ Low OSLO balance, attempting to use what's available...\n");
  } else {
    console.log("");
  }

  // Transfer to InvestmentEngine
  console.log("📤 Step 2: Transferring OSLO to InvestmentEngine...\n");
  const transferAmount = ethers.parseEther("5000000"); // 5M OSLO
  const transferTx = await osloToken.transfer(NEW_IE_ADDRESS, transferAmount);
  await transferTx.wait();
  
  const ieBalance = await osloToken.balanceOf(NEW_IE_ADDRESS);
  console.log("  IE OSLO Balance:", ethers.formatEther(ieBalance), "\n");

  // Test deposit
  console.log("🧪 Step 3: Testing deposit...\n");
  const wallet = new ethers.Wallet(PRIVATE_KEY).connect(ethers.provider);
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE_ADDRESS, wallet);

  const walletUsdtBalance = await mockUSDT.balanceOf(WALLET_ADDRESS);
  console.log("  Wallet USDT:", ethers.formatEther(walletUsdtBalance));

  // Approve 1000 USDT
  console.log("\n  Approving 1000 USDT...");
  const approveAmount = ethers.parseEther("1000");
  const approveTx = await mockUSDT.approve(NEW_IE_ADDRESS, approveAmount);
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  // Deposit
  console.log("  Attempting deposit of 1000 USDT...");
  try {
    const depositTx = await ie.deposit(approveAmount);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", depositTx.hash);
    
    const receipt = await depositTx.wait();
    console.log("  ✅ DEPOSIT SUCCESSFUL!");
    console.log("  Block:", receipt.blockNumber);
    console.log("");

    // Verify
    const depositCount = await ie.getDepositCount(WALLET_ADDRESS);
    console.log("  📊 Deposit Count:", depositCount.toString());
    
    if (depositCount > 0n) {
      const deposit = await ie.getDeposit(WALLET_ADDRESS, 0);
      console.log("  Amount:", ethers.formatEther(deposit.amount), "USDT");
      console.log("  Tier:", deposit.tier);
      console.log("  Daily Rate:", deposit.dailyRate);
      console.log("  Active:", deposit.active);
      console.log("");
    }
  } catch (error: any) {
    console.log("  ❌ Deposit failed!");
    console.log("  Error:", error.message);
    if (error.data) {
      console.log("  Raw data:", error.data);
    }
    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
