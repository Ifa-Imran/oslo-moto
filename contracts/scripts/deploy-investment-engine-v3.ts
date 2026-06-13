/**
 * Deploy New OSLOInvestmentEngine with Early Exit Timer Fix
 * 
 * This script deploys a new InvestmentEngine contract with:
 * 1. Early exit timer fix (one-time per account, not per deposit)
 * 2. Missing trial period functions (isInTrialPeriod, getTrialTimeRemaining)
 * 3. Level income distribution (already working, no changes needed)
 * 
 * Run: npx hardhat run scripts/deploy-investment-engine-v3.ts --network bscTestnet
 */

import { ethers } from "hardhat";

// ─── Existing Testnet Addresses ───────────────────────────────────────────
const EXISTING = {
  usdt: "0x493769a8F24e62AEEB8aE6C2d8E24327BD41FEE3",
  osloToken: "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6",
  osloDEX: "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F",
  referral: "0x77e81eE198d93b16FFa7784540d2FEeE3cD25274",
  rankSystem: "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844",
  treasury: "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1",
  oldInvestmentEngine: "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC",
};

// Launch timestamp (May 10, 2026 00:00:00 UTC)
const LAUNCH_TIMESTAMP = 1_778_371_200;

// Timelock address (use deployer for now, can be updated later)
const TIMELOCK = ""; // Will be set to deployer if empty

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("OSLO INVESTMENT ENGINE V3 DEPLOYMENT");
  console.log("=".repeat(70));
  console.log("\nDeployer:", deployer.address);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "BNB\n");

  // ─── Step 1: Deploy New InvestmentEngine ───────────────────────────────────
  console.log("─".repeat(70));
  console.log("Step 1: Deploying OSLOInvestmentEngine V3...");
  console.log("─".repeat(70));

  const timelock = TIMELOCK || deployer.address;

  const InvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const newIE = await InvestmentEngine.deploy(
    EXISTING.usdt,
    EXISTING.osloToken,
    LAUNCH_TIMESTAMP
  );

  await newIE.waitForDeployment();
  const newIEAddress = await newIE.getAddress();
  console.log("✅ New InvestmentEngine deployed:", newIEAddress);

  // ─── Step 2: Configure New InvestmentEngine ───────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 2: Configuring New InvestmentEngine...");
  console.log("─".repeat(70));

  const tx1 = await newIE.configure(
    EXISTING.treasury,
    EXISTING.referral,
    EXISTING.rankSystem,
    EXISTING.osloDEX,
    timelock
  );
  await tx1.wait();
  console.log("✅ Configuration complete");
  console.log("  Treasury:", EXISTING.treasury);
  console.log("  Referral:", EXISTING.referral);
  console.log("  RankSystem:", EXISTING.rankSystem);
  console.log("  DEX:", EXISTING.osloDEX);
  console.log("  Timelock:", timelock);

  // ─── Step 3: Set Reward Wallets ──────────────────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 3: Setting Reward Wallets...");
  console.log("─".repeat(70));

  // TODO: Replace with actual wallet addresses from old IE
  const oldIE = await ethers.getContractAt("OSLOInvestmentEngine", EXISTING.oldInvestmentEngine);
  const rewardWallet = await oldIE.rewardWallet();
  const companyWallet = await oldIE.companyWallet();
  const performanceWallet = await oldIE.performanceWallet();

  console.log("  Reward Wallet:", rewardWallet);
  console.log("  Company Wallet:", companyWallet);
  console.log("  Performance Wallet:", performanceWallet);

  const tx2 = await newIE.setRewardWallets(rewardWallet, companyWallet, performanceWallet);
  await tx2.wait();
  console.log("✅ Reward wallets set");

  // ─── Step 4: Complete Setup (Optional - keeps admin open for migrations) ─────
  console.log("\n─".repeat(70));
  console.log("Step 4: Setup Completion...");
  console.log("─".repeat(70));

  console.log("⚠️  Keeping admin OPEN for migration and testing");
  console.log("   Call completeSetup() later when ready to renounce admin");

  // ─── Step 5: Update Other Contracts to Point to New IE ────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 5: Updating Contract Pointers...");
  console.log("─".repeat(70));

  // 5a. Update Referral Contract
  console.log("\n5a. Updating Referral Contract...");
  const referral = await ethers.getContractAt("OSLOReferral", EXISTING.referral);
  const referralTimelock = await referral.timelock();
  const referralSetupComplete = await referral.setupComplete();

  console.log("  Referral Timelock:", referralTimelock);
  console.log("  Referral Setup Complete:", referralSetupComplete);

  if (!referralSetupComplete) {
    const tx3 = await referral.configure(
      newIEAddress,
      EXISTING.osloDEX,
      referralTimelock
    );
    await tx3.wait();
    console.log("  ✅ Referral.investmentEngine → New IE (via configure)");
  } else {
    console.log("  ⚠️  Referral setupComplete = true");
    console.log("     Need timelock to call setInvestmentEngine()");
    console.log("     TX: await referral.connect(timelockSigner).setInvestmentEngine('", newIEAddress, "')");
  }

  // 5b. Update RankSystem
  console.log("\n5b. Updating RankSystem...");
  const rankSystem = await ethers.getContractAt("OSLORankSystem", EXISTING.rankSystem);
  const rankTimelock = await rankSystem.timelock();
  
  const tx4 = await rankSystem.setInvestmentEngine(newIEAddress);
  await tx4.wait();
  console.log("  ✅ RankSystem.investmentEngine → New IE");

  // 5c. Update OSLODEX
  console.log("\n5c. Updating OSLODEX...");
  const dex = await ethers.getContractAt("OSLODEX", EXISTING.osloDEX);
  const dexTimelock = await dex.timelock();
  const dexIE = await dex.investmentEngine();

  console.log("  DEX Timelock:", dexTimelock);
  console.log("  DEX Current IE:", dexIE);

  // Check if deployer is timelock or admin
  const dexAdmin = await dex.admin();
  const isTimelock = dexTimelock.toLowerCase() === deployer.address.toLowerCase();
  const isAdmin = dexAdmin.toLowerCase() === deployer.address.toLowerCase();

  if (isTimelock || isAdmin) {
    const tx5 = await dex.setInvestmentEngine(newIEAddress);
    await tx5.wait();
    console.log("  ✅ OSLODEX.investmentEngine → New IE");
  } else {
    console.log("  ⚠️  Deployer is not timelock or admin on DEX");
    console.log("     Timelock:", dexTimelock);
    console.log("     Admin:", dexAdmin);
    console.log("     Need authorized signer to call: dex.setInvestmentEngine('", newIEAddress, "')");
  }

  // ─── Step 6: Seed New IE with OSLO (for yield claims & referral commissions) ─
  console.log("\n─".repeat(70));
  console.log("Step 6: Seeding New IE with OSLO...");
  console.log("─".repeat(70));

  const osloToken = await ethers.getContractAt("IERC20", EXISTING.osloToken);
  const deployerOsloBalance = await osloToken.balanceOf(deployer.address);
  const oldIEOsloBalance = await osloToken.balanceOf(EXISTING.oldInvestmentEngine);

  console.log("  Deployer OSLO Balance:", ethers.formatEther(deployerOsloBalance));
  console.log("  Old IE OSLO Balance:", ethers.formatEther(oldIEOsloBalance));

  // Transfer OSLO from old IE to new IE (if deployer has authority)
  // Or from deployer's wallet
  const seedAmount = ethers.parseEther("5000000"); // 5M OSLO
  if (deployerOsloBalance >= seedAmount) {
    const tx6 = await osloToken.transfer(newIEAddress, seedAmount);
    await tx6.wait();
    console.log("  ✅ Seeded new IE with", ethers.formatEther(seedAmount), "OSLO");
  } else {
    console.log("  ⚠️  Insufficient deployer OSLO balance");
    console.log("     Need to transfer OSLO to new IE manually");
    console.log("     TX: await osloToken.transfer('", newIEAddress, "', ethers.parseEther('5000000'))");
  }

  // ─── Step 7: Migrate User Data ───────────────────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 7: User Data Migration...");
  console.log("─".repeat(70));

  console.log("⚠️  IMPORTANT: User deposits need to be migrated from old IE to new IE");
  console.log("\nOptions:");
  console.log("  A) Use migrateUsers() function (if available in new IE)");
  console.log("  B) Users withdraw from old IE and deposit to new IE (not recommended)");
  console.log("  C) Keep old IE active alongside new IE (gradual migration)");
  console.log("\n📝 Migration script will be created separately");
  console.log("   Run: npx hardhat run scripts/migrate-investment-engine.ts --network bscMainnet");

  // ─── Final Summary ───────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(70));
  console.log("\n✅ New InvestmentEngine:", newIEAddress);
  console.log("✅ Configured with existing contracts");
  console.log("✅ Reward wallets set");
  console.log("✅ RankSystem updated");
  console.log("⚠️  Referral contract needs update (check timelock)");
  console.log("⚠️  DEX contract needs update (check authorization)");
  console.log("⚠️  OSLO seeding required");
  console.log("⚠️  User data migration required");
  console.log("\n📋 Next Steps:");
  console.log("  1. Verify new IE configuration");
  console.log("  2. Update Referral and DEX pointers");
  console.log("  3. Seed OSLO to new IE");
  console.log("  4. Run migration script for user data");
  console.log("  5. Test on testnet first!");
  console.log("  6. Update frontend contract address");
  console.log("  7. Call completeSetup() when ready to renounce admin");
  console.log("\n⚠️  WARNING: Test thoroughly on testnet before mainnet deployment!");
  console.log("=".repeat(70) + "\n");

  // Save deployment addresses
  const fs = await import("fs");
  const path = await import("path");
  const outputPath = path.join(__dirname, "../data/testnet-v4-addresses.json");
  
  const deploymentData = {
    deploymentDate: new Date().toISOString(),
    newInvestmentEngine: newIEAddress,
    oldInvestmentEngine: EXISTING.oldInvestmentEngine,
    usdt: EXISTING.usdt,
    osloToken: EXISTING.osloToken,
    osloDEX: EXISTING.osloDEX,
    referral: EXISTING.referral,
    rankSystem: EXISTING.rankSystem,
    treasury: EXISTING.treasury,
    changes: [
      "Fixed early exit timer (one-time per account)",
      "Added isInTrialPeriod() function",
      "Added getTrialTimeRemaining() function",
      "Added earlyExitExpired flag to UserInfo"
    ]
  };

  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log("📄 Deployment addresses saved to:", outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
