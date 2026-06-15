import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Testing Deposit with Detailed Error Analysis\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const NEW_IE_ADDRESS = "0x6522745D648019360f96E13a54C8A1D8AAc2A3Ee";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const OSLODEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const WALLET_ADDRESS = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const PRIVATE_KEY = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";

  const wallet = new ethers.Wallet(PRIVATE_KEY).connect(ethers.provider);
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE_ADDRESS, wallet);
  const oslodex = await ethers.getContractAt("OSLODEX", OSLODEX_ADDRESS);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN_ADDRESS);

  // Step 1: Check all balances
  console.log("💰 Balances:");
  const walletUsdt = await mockUSDT.balanceOf(WALLET_ADDRESS);
  const ieOslo = await osloToken.balanceOf(NEW_IE_ADDRESS);
  const dexUsdt = await mockUSDT.balanceOf(OSLODEX_ADDRESS);
  const dexOslo = await osloToken.balanceOf(OSLODEX_ADDRESS);
  
  console.log("  Wallet USDT:", ethers.formatEther(walletUsdt));
  console.log("  IE OSLO:", ethers.formatEther(ieOslo));
  console.log("  DEX USDT:", ethers.formatEther(dexUsdt));
  console.log("  DEX OSLO:", ethers.formatEther(dexOslo));
  console.log("");

  // Step 2: Check DEX reserves
  console.log("📊 DEX Reserves:");
  const [usdtReserve, osloReserve] = await oslodex.getReserves();
  console.log("  USDT Reserve:", ethers.formatEther(usdtReserve));
  console.log("  OSLO Reserve:", ethers.formatEther(osloReserve));
  console.log("");

  // Step 3: Check if DEX has sell endpoint configured
  console.log("🔎 DEX Configuration:");
  try {
    const isSellEndpoint = await oslodex.isSellEndpoint(wallet.address);
    console.log("  Wallet is sell endpoint:", isSellEndpoint);
  } catch (e) {
    console.log("  Cannot check sell endpoint");
  }
  console.log("");

  // Step 4: Try deposit with error details
  console.log("🧪 Attempting deposit of 1000 USDT...\n");
  const depositAmount = ethers.parseEther("1000");
  
  // Approve
  console.log("  Approving USDT...");
  const approveTx = await mockUSDT.approve(NEW_IE_ADDRESS, depositAmount);
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  console.log("  Calling deposit()...");
  try {
    const depositTx = await ie.deposit(depositAmount);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", depositTx.hash);
    
    const receipt = await depositTx.wait();
    console.log("\n✅✅✅ DEPOSIT SUCCESSFUL! ✅✅✅");
    console.log("  Block:", receipt.blockNumber);
    console.log("");

    // Verify deposit
    const depositCount = await ie.getDepositCount(WALLET_ADDRESS);
    console.log("  📊 Deposit Count:", depositCount.toString());
    
    if (depositCount > 0n) {
      const deposit = await ie.getDeposit(WALLET_ADDRESS, 0);
      console.log("\n  Deposit Details:");
      console.log("    Amount:", ethers.formatEther(deposit.amount), "USDT");
      console.log("    Tier:", deposit.tier);
      console.log("    Daily Rate:", deposit.dailyRate);
      console.log("    Active:", deposit.active);
      console.log("");
    }
  } catch (error: any) {
    console.log("\n❌ Deposit failed!");
    console.log("  Error message:", error.message);
    
    if (error.data) {
      console.log("  Error data:", error.data);
      
      // Try to decode the error
      if (error.data.startsWith("0x0ab366de")) {
        console.log("\n  🔍 Error 0x0ab366de analysis:");
        console.log("    This is NOT a standard custom error selector.");
        console.log("    Most likely causes:");
        console.log("    1. DEX processDeposit() is reverting");
        console.log("    2. USDT transferFrom failed");
        console.log("    3. DEX not properly configured");
        console.log("");
        console.log("    💡 RECOMMENDATION: Check DEX configuration and try seeding more liquidity");
      }
    }
    
    if (error.reason) {
      console.log("  Reason:", error.reason);
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
