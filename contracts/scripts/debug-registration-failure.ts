import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Debug Registration Failure\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const walletAddress = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const privateKey = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  const wallet = new ethers.Wallet(privateKey).connect(ethers.provider);

  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const MOCK_USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";

  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", MOCK_USDT_ADDRESS);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);

  console.log("📊 Current State:");
  console.log("  Wallet:", walletAddress);
  console.log("  Referral Contract:", REFERRAL_ADDRESS);
  console.log("");

  // Check USDT balance
  const balance = await mockUSDT.balanceOf(walletAddress);
  console.log("💰 USDT Balance:", ethers.formatEther(balance));

  // Check allowance
  const allowance = await mockUSDT.allowance(walletAddress, REFERRAL_ADDRESS);
  console.log("✅ USDT Allowance:", ethers.formatEther(allowance));

  // Check registration status
  const userInfo = await referral.userInfo(walletAddress);
  console.log("📝 Registered:", userInfo.registered);
  console.log("");

  // Check if referral contract has USDT
  const referralUSDT = await mockUSDT.balanceOf(REFERRAL_ADDRESS);
  console.log("🏦 Referral Contract USDT Balance:", ethers.formatEther(referralUSDT));
  console.log("");

  // Decode the error
  console.log("🔍 Error Analysis:");
  console.log("  Error selector: 0xfb8f41b2");
  console.log("  This is NOT a custom error from OSLOReferral.sol");
  console.log("  It's likely from the DEX contract (injectUSDTLiquidity)");
  console.log("");

  // Check DEX address
  console.log("📋 Checking DEX configuration...");
  
  // Try to read DEX address from referral contract (if there's a getter)
  try {
    const osloDex = await referral.osloDex();
    console.log("  OSLO DEX:", osloDex);
    
    if (osloDex !== ethers.ZeroAddress) {
      console.log("  ⚠️  DEX is configured!");
      console.log("  💡 The registration fee is being sent to DEX for liquidity injection");
      console.log("");
      
      // Check if DEX has injectUSDTLiquidity function
      const dexContract = await ethers.getContractAt("IOSLODEX", osloDex);
      console.log("  Testing DEX contract...");
      
      // Try to call injectUSDTLiquidity to see if it works
      const usdtForDex = await mockUSDT.balanceOf(REFERRAL_ADDRESS);
      console.log("  USDT in referral contract:", ethers.formatEther(usdtForDex));
      
    } else {
      console.log("  ✅ DEX not configured (will skip liquidity injection)");
    }
  } catch (error) {
    console.log("  ❌ Cannot read DEX address:", error.message);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 RECOMMENDATION:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("The error is happening during DEX liquidity injection.");
  console.log("The referral contract successfully receives the USDT,");
  console.log("but fails when trying to inject it into the DEX.\n");
  console.log("SOLUTION: The DEX contract might not be deployed or");
  console.log("the injectUSDTLiquidity function is reverting.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
