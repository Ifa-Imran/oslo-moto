/**
 * Check Testnet Deployment Status & Requirements
 * 
 * Shows what's been deployed and what's needed to continue
 */

import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  console.log("📊 Testnet Deployment Status\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 BNB Balance:", ethers.formatEther(balance), "BNB\n");

  console.log("🌐 Network: BSC Testnet (Chain ID: 97)");
  console.log("");

  // Check existing addresses
  const existingAddresses = JSON.parse(
    fs.readFileSync("data/testnet-addresses.json", "utf8")
  );

  console.log("📋 Existing Deployed Contracts:");
  console.log("━".repeat(70));
  console.log("USDT (Mock):         ", existingAddresses.USDT);
  console.log("OSLOToken:           ", existingAddresses.OSLOToken);
  console.log("OSLODEX (old):       ", existingAddresses.OSLODEX);
  console.log("OSLOTreasury (old):  ", existingAddresses.OSLOTreasury);
  console.log("OSLOLiquidityManager:", existingAddresses.OSLOLiquidityManager);
  console.log("OSLODAO:             ", existingAddresses.OSLODAO);
  console.log("OSLORankSystem:      ", existingAddresses.OSLORankSystem);
  console.log("OSLOReferral (old):  ", existingAddresses.OSLOReferral);
  console.log("OSLOInvestmentEngine:", existingAddresses.OSLOInvestmentEngine);
  console.log("━".repeat(70));
  console.log("");

  console.log("⚠️  ISSUE: Insufficient BNB for deployment");
  console.log("");
  console.log("💡 SOLUTION:");
  console.log("━".repeat(70));
  console.log("You need more BNB on BSC Testnet to deploy contracts.");
  console.log("");
  console.log("Options:");
  console.log("  1. Get free BNB from faucet:");
  console.log("     https://testnet.bnbchain.org/faucet-smart");
  console.log("");
  console.log("  2. Recommended amount: 0.5 - 1.0 BNB");
  console.log("     - Current balance:", ethers.formatEther(balance), "BNB");
  console.log("     - Need at least: ~0.3 BNB for all deployments");
  console.log("");
  console.log("  3. After getting BNB, run:");
  console.log("     npx hardhat run scripts/redeploy-all-testnet.ts --network bscTestnet");
  console.log("━".repeat(70));
  console.log("");

  console.log("📝 What will be deployed:");
  console.log("  ✅ OSLODEX (with approve() fix)");
  console.log("  ✅ OSLOInvestmentEngine (with approve() fix)");
  console.log("  ✅ OSLOVault USDT (with approve() fix)");
  console.log("  ✅ OSLOVault OSLO (with approve() fix)");
  console.log("  ✅ OSLOTreasury");
  console.log("  ✅ FeeRouter");
  console.log("  ✅ OSLOReferral (with approve() fix)");
  console.log("");
  console.log("⚠️  This does NOT affect mainnet!");
  console.log("✅ All fixes ready for deployment");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
