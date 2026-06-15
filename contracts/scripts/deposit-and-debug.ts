/**
 * Deposit & Debug Script
 * 
 * Tests deposit flow with the OLD InvestmentEngine (which works with DEX)
 * and provides detailed error diagnostics
 * 
 * Run: npx hardhat run scripts/deposit-and-debug.ts --network bscTestnet
 */

import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Deposit & Debug Script\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Configuration
  const WALLET_ADDRESS = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const PRIVATE_KEY = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const OSLO_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const IE_ADDRESS = "0xcB406995e635C577d22b66F71fD84e748eC67488"; // OLD IE (works with DEX)
  const DEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const REFERRAL_ADDRESS = "0x0D584e91182a91e0500db20a603D0f732bE01B12";

  const wallet = new ethers.Wallet(PRIVATE_KEY).connect(ethers.provider);
  console.log("👤 Wallet:", WALLET_ADDRESS);
  console.log("💰 Wallet BNB:", ethers.formatEther(await ethers.provider.getBalance(WALLET_ADDRESS)), "BNB\n");

  // Contract instances
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_ADDRESS);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDRESS, wallet);
  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDRESS);

  // ─── Step 1: Pre-deposit Checks ───────────────────────────────────────────
  console.log("📊 Step 1: Pre-deposit Checks\n");
  console.log("━".repeat(70));

  // Wallet balances
  const walletUsdt = await mockUSDT.balanceOf(WALLET_ADDRESS);
  const walletOslo = await osloToken.balanceOf(WALLET_ADDRESS);
  console.log("\n💰 Wallet Balances:");
  console.log("  USDT:", ethers.formatEther(walletUsdt));
  console.log("  OSLO:", ethers.formatEther(walletOslo));

  // Contract balances
  const ieUsdt = await mockUSDT.balanceOf(IE_ADDRESS);
  const ieOslo = await osloToken.balanceOf(IE_ADDRESS);
  const dexUsdt = await mockUSDT.balanceOf(DEX_ADDRESS);
  const dexOslo = await osloToken.balanceOf(DEX_ADDRESS);
  console.log("\n🏦 Contract Balances:");
  console.log("  IE USDT:", ethers.formatEther(ieUsdt));
  console.log("  IE OSLO:", ethers.formatEther(ieOslo));
  console.log("  DEX USDT:", ethers.formatEther(dexUsdt));
  console.log("  DEX OSLO:", ethers.formatEther(dexOslo));

  // DEX reserves
  const [usdtReserve, osloReserve] = await dex.getReserves();
  console.log("\n📈 DEX Reserves:");
  console.log("  USDT:", ethers.formatEther(usdtReserve));
  console.log("  OSLO:", ethers.formatEther(osloReserve));

  // InvestmentEngine config
  console.log("\n⚙️ InvestmentEngine Configuration:");
  try {
    const ieOsloDex = await investmentEngine.osloDex();
    console.log("  DEX Address:", ieOsloDex);
    console.log("  Match:", ieOsloDex.toLowerCase() === DEX_ADDRESS.toLowerCase());
  } catch (e: any) {
    console.log("  Cannot read config:", e.message);
  }

  // Current deposits
  try {
    const depositCount = await investmentEngine.getDepositCount(WALLET_ADDRESS);
    console.log("\n📋 Current Deposits:", depositCount.toString());
  } catch (e: any) {
    console.log("\n📋 Cannot read deposits:", e.message);
  }

  // ─── Step 2: Test Deposit ─────────────────────────────────────────────────
  console.log("\n\n🧪 Step 2: Testing Deposit\n");
  console.log("━".repeat(70));

  const depositAmount = ethers.parseEther("100"); // 100 USDT
  console.log("\n📝 Deposit Amount:", ethers.formatEther(depositAmount), "USDT");

  // Check allowance
  const currentAllowance = await mockUSDT.allowance(WALLET_ADDRESS, IE_ADDRESS);
  console.log("\n🔓 Current Allowance:", ethers.formatEther(currentAllowance), "USDT");

  // Approve if needed
  if (currentAllowance < depositAmount) {
    console.log("\n📝 Approving USDT...");
    try {
      const approveTx = await mockUSDT.approve(IE_ADDRESS, depositAmount);
      console.log("  TX Hash:", approveTx.hash);
      await approveTx.wait();
      console.log("  ✅ Approved");
    } catch (error: any) {
      console.log("  ❌ Approval failed!");
      console.log("  Error:", error.message);
      console.log("\n💡 Cannot proceed without approval\n");
      return;
    }
  } else {
    console.log("  ✅ Already approved");
  }

  // Attempt deposit
  console.log("\n🚀 Attempting Deposit...\n");
  console.log("  Calling: investmentEngine.deposit(", ethers.formatEther(depositAmount), ")");
  console.log("  From:", WALLET_ADDRESS);
  console.log("  To IE:", IE_ADDRESS);

  try {
    // Use estimateGas first to catch errors without executing
    console.log("\n🔍 Estimating gas...");
    try {
      const gasEstimate = await investmentEngine.deposit.estimateGas(depositAmount);
      console.log("  ✅ Gas estimate:", gasEstimate.toString());
    } catch (error: any) {
      console.log("  ❌ Gas estimation failed!");
      console.log("  Error:", error.message);
      if (error.data) {
        console.log("  Error data:", error.data);
        decodeError(error.data);
      }
      console.log("\n💡 Attempting actual transaction anyway...\n");
    }

    // Execute deposit
    console.log("📤 Sending transaction...");
    const depositTx = await investmentEngine.deposit(depositAmount);
    console.log("  ⏳ TX Hash:", depositTx.hash);
    console.log("  ⏳ Waiting for confirmation...");
    
    const receipt = await depositTx.wait();
    
    console.log("\n✅✅✅ DEPOSIT SUCCESSFUL! ✅✅✅\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Block Number:", receipt.blockNumber);
    console.log("  Gas Used:", receipt.gasUsed.toString());
    console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Verify deposit
    console.log("📊 Verifying Deposit...\n");
    const newDepositCount = await investmentEngine.getDepositCount(WALLET_ADDRESS);
    console.log("  Total Deposits:", newDepositCount.toString());

    if (newDepositCount > 0n) {
      const deposit = await investmentEngine.getDeposit(WALLET_ADDRESS, newDepositCount - 1n);
      console.log("\n  📋 Latest Deposit:");
      console.log("    Amount:", ethers.formatEther(deposit.amount), "USDT");
      console.log("    Tier:", deposit.tier);
      console.log("    Daily Rate:", deposit.dailyRate);
      console.log("    Max Return:", ethers.formatEther(deposit.maxReturn), "USDT");
      console.log("    Active:", deposit.active);
      console.log("    Deposit Time:", new Date(Number(deposit.depositTime) * 1000).toISOString());
      console.log("    Last Claim:", new Date(Number(deposit.lastClaimTime) * 1000).toISOString());
      console.log("    Total Claimed:", ethers.formatEther(deposit.totalClaimed), "USDT");
    }

    // Check balances after
    console.log("\n💰 Balances After Deposit:");
    const newWalletUsdt = await mockUSDT.balanceOf(WALLET_ADDRESS);
    const newIeOslo = await osloToken.balanceOf(IE_ADDRESS);
    console.log("  Wallet USDT:", ethers.formatEther(newWalletUsdt));
    console.log("  IE OSLO:", ethers.formatEther(newIeOslo));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 DEPOSIT TEST COMPLETE!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error: any) {
    console.log("\n❌❌❌ DEPOSIT FAILED! ❌❌❌\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Error Analysis:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("  Message:", error.message);
    console.log("");

    if (error.data) {
      console.log("  Raw Error Data:", error.data);
      console.log("");
      decodeError(error.data);
    }

    if (error.reason) {
      console.log("  Reason:", error.reason);
      console.log("");
    }

    if (error.code) {
      console.log("  Error Code:", error.code);
      console.log("");
    }

    // Provide troubleshooting
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 TROUBLESHOOTING:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("Common issues:");
    console.log("  1. forceApprove failing with MockUSDT (testnet only)");
    console.log("  2. Insufficient DEX OSLO reserve");
    console.log("  3. IE not configured with DEX");
    console.log("  4. Deposits paused");
    console.log("  5. Amount outside min/max limits");
    console.log("");
    console.log("Solutions:");
    console.log("  - For testnet: Use mainnet deployment with real USDT");
    console.log("  - Check DEX has enough OSLO (currently:", ethers.formatEther(dexOslo), ")");
    console.log("  - Verify IE configuration matches DEX address");
    console.log("  - Check if deposits are paused in IE");
    console.log("");
  }
}

/**
 * Decode error selector to human-readable error name
 */
function decodeError(errorData: string) {
  console.log("🔍 Decoding Error Selector...\n");
  
  if (!errorData || errorData === "0x") {
    console.log("  No error data to decode\n");
    return;
  }

  const selector = errorData.slice(0, 10);
  console.log("  Error Selector:", selector);

  // Known error selectors
  const knownErrors: Record<string, string> = {
    "0xfb8f41b2": "SafeERC20FailedOperation (forceApprove issue)",
    "0x0ab366de": "OnlyInvestmentEngine (DEX authorization)",
    "0xe450d38c": "InvalidReferrer (registration issue)",
    "0x28b35f21": "InsufficientReserve (DEX OSLO)",
    "0x1f2a2005": "ZeroAmount",
    "0x70c9c181": "SafeERC20FailedOperation",
    "0x42896f16": "DepositTooLow",
    "0x3f809733": "DepositTooHigh",
    "0x83669123": "DepositsPausedError",
    "0x61104228": "InvalidReferrer",
  };

  if (knownErrors[selector]) {
    console.log("  ✅ Matched:", knownErrors[selector]);
    console.log("");
    console.log("  💡 Explanation:");
    
    if (selector === "0xfb8f41b2") {
      console.log("    - SafeERC20.forceApprove() is failing");
      console.log("    - This happens with MockUSDT on testnet");
      console.log("    - Real USDT on mainnet will work fine");
      console.log("    - Fix: Deploy with real tokens or use approve()");
    } else if (selector === "0x0ab366de") {
      console.log("    - DEX is rejecting the InvestmentEngine");
      console.log("    - IE address not authorized in DEX");
      console.log("    - Fix: Call dex.setInvestmentEngine(newIE)");
    } else if (selector === "0x28b35f21") {
      console.log("    - DEX doesn't have enough OSLO reserve");
      console.log("    - Fix: Transfer OSLO to DEX or IE");
    }
  } else {
    console.log("  ⚠️ Unknown error selector");
    console.log("  💡 This may be a custom error or panic code");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
