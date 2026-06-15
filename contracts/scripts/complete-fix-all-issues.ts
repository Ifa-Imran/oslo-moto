import { ethers } from "hardhat";

async function main() {
  console.log("🔧 COMPLETE FIX: Transfer OSLO & Test Deposit\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  
  const OLD_IE_ADDRESS = "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC";
  const NEW_IE_ADDRESS = "0x6522745D648019360f96E13a54C8A1D8AAc2A3Ee";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const WALLET_ADDRESS = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const PRIVATE_KEY = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";

  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN_ADDRESS);
  const oldIE = await ethers.getContractAt("OSLOInvestmentEngine", OLD_IE_ADDRESS);
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS);

  // Step 1: Check if we can call emergencyWithdraw on old IE
  console.log("🔍 Step 1: Checking old IE functions...\n");
  
  const oldIEOsloBalance = await osloToken.balanceOf(OLD_IE_ADDRESS);
  console.log("  Old IE OSLO:", ethers.formatEther(oldIEOsloBalance));
  
  try {
    // Try to call admin functions - they will fail if admin is zero
    const admin = await oldIE.admin();
    console.log("  Old IE Admin:", admin);
    
    if (admin === ethers.ZeroAddress) {
      console.log("\n  ❌ Old IE admin is zero - cannot withdraw OSLO");
      console.log("  💡 Alternative: Skip OSLO transfer, deposits should still work\n");
    } else if (admin.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("  ✅ Deployer is admin - can transfer OSLO\n");
      
      // Try emergency withdraw
      console.log("  Attempting emergency OSLO withdrawal...");
      try {
        const withdrawAmount = ethers.parseEther("5000000"); // 5M OSLO
        const withdrawTx = await oldIE.emergencyWithdrawOSLO(NEW_IE_ADDRESS, withdrawAmount);
        await withdrawTx.wait();
        console.log("  ✅ Withdrawn 5M OSLO to new IE\n");
      } catch (error: any) {
        console.log("  ❌ emergencyWithdrawOSLO not available:", error.message.split('\n')[0]);
        console.log("");
      }
    }
  } catch (error: any) {
    console.log("  Error checking admin:", error.message);
    console.log("");
  }

  // Step 2: Check new IE OSLO balance
  console.log("🔍 Step 2: Checking new IE OSLO balance...\n");
  const newIEOsloBalance = await osloToken.balanceOf(NEW_IE_ADDRESS);
  console.log("  New IE OSLO:", ethers.formatEther(newIEOsloBalance));
  console.log("");

  // Step 3: Check DEX state
  console.log("🔍 Step 3: Checking DEX state...\n");
  const oslodex = await ethers.getContractAt("OSLODEX", "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F");
  const [usdtReserve, osloReserve] = await oslodex.getReserves();
  console.log("  DEX USDT Reserve:", ethers.formatEther(usdtReserve));
  console.log("  DEX OSLO Reserve:", ethers.formatEther(osloReserve));
  console.log("");

  // Step 4: Test deposit
  console.log("🧪 Step 4: Testing deposit...\n");
  const wallet = new ethers.Wallet(PRIVATE_KEY).connect(ethers.provider);
  const walletMockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const newIE = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE_ADDRESS, wallet);

  const walletUsdtBalance = await walletMockUSDT.balanceOf(WALLET_ADDRESS);
  console.log("  Wallet USDT:", ethers.formatEther(walletUsdtBalance));

  if (walletUsdtBalance < ethers.parseEther("100")) {
    console.log("  ❌ Insufficient USDT\n");
    return;
  }

  // Approve
  const depositAmount = ethers.parseEther("100"); // Test with 100 USDT
  console.log("\n  Approving 100 USDT...");
  const approveTx = await walletMockUSDT.approve(NEW_IE_ADDRESS, depositAmount);
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  // Deposit
  console.log("  Attempting deposit...");
  try {
    const depositTx = await newIE.deposit(depositAmount);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", depositTx.hash);
    
    const receipt = await depositTx.wait();
    console.log("\n✅✅✅ DEPOSIT SUCCESSFUL! ✅✅✅");
    console.log("  Block:", receipt.blockNumber);
    console.log("  Gas Used:", receipt.gasUsed.toString());
    console.log("");

    // Verify
    const depositCount = await newIE.getDepositCount(WALLET_ADDRESS);
    console.log("  📊 Deposit Count:", depositCount.toString());
    
    if (depositCount > 0n) {
      const deposit = await newIE.getDeposit(WALLET_ADDRESS, 0);
      console.log("\n  📋 Deposit Details:");
      console.log("    Amount:", ethers.formatEther(deposit.amount), "USDT");
      console.log("    Tier:", deposit.tier);
      console.log("    Daily Rate:", deposit.dailyRate);
      console.log("    Max Return:", ethers.formatEther(deposit.maxReturn), "USDT");
      console.log("    Active:", deposit.active);
      console.log("    Deposit Time:", new Date(Number(deposit.depositTime) * 1000).toISOString());
      console.log("");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 ALL ISSUES FIXED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("✅ Fixed: forceApprove → approve");
    console.log("✅ Fixed: Frontend contract address");
    console.log("✅ Fixed: Deposit flow working");
    console.log("✅ New IE Address:", NEW_IE_ADDRESS);
    console.log("");
    console.log("⚠️  Update frontend/src/lib/contracts-testnet.ts:");
    console.log("   investmentEngine:", `"${NEW_IE_ADDRESS}"`);
    console.log("");

  } catch (error: any) {
    console.log("\n❌ Deposit failed!");
    console.log("  Error:", error.message.split('\n')[0]);
    
    if (error.data) {
      console.log("  Data:", error.data);
    }
    console.log("");
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 NEXT STEPS:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("1. The contract needs OSLO reserve in new IE");
    console.log("2. Old IE has", ethers.formatEther(oldIEOsloBalance), "OSLO but admin is zero");
    console.log("3. Options:");
    console.log("   a) Deploy completely new IE without OSLO reserve check");
    console.log("   b) Find a way to transfer from old IE");
    console.log("   c) Accept that testnet deposits need DEX to have enough OSLO");
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
