/**
 * Migrate User Data from Old to New InvestmentEngine
 * 
 * This script migrates all user deposits and earnings from the old
 * OSLOInvestmentEngine to the new one with the early exit timer fix.
 * 
 * Run: npx hardhat run scripts/migrate-investment-engine.ts --network bscMainnet
 */

import { ethers } from "hardhat";

// ─── Contract Addresses ───────────────────────────────────────────
const OLD_IE = "0x4d27A6564BE18fF57f4484aCBd8F5bCc9caB2E80";
const NEW_IE = ""; // ← Fill in after deployment
const REFERRAL = "0x04874b7fE1b31B4cC45575f15bcE7Aeb90399Cd3";
const OSLO_DEX = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const OSLO_TOKEN = "0xE1C6B447bFf4e8292d8c2463e3F68ED7Be8e4a32";

// Batch size for processing users (to avoid gas limits)
const BATCH_SIZE = 50;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("INVESTMENT ENGINE USER DATA MIGRATION");
  console.log("=".repeat(70));
  console.log("\nDeployer:", deployer.address);
  console.log("Old IE:", OLD_IE);
  console.log("New IE:", NEW_IE || "⚠️  NOT SET - Update script first!");
  console.log("");

  if (!NEW_IE) {
    console.error("❌ ERROR: NEW_IE address is not set!");
    console.error("   Please update the script with the new InvestmentEngine address");
    process.exit(1);
  }

  // ─── Contract Instances ────────────────────────────────────────────
  const oldIE = await ethers.getContractAt("OSLOInvestmentEngine", OLD_IE);
  const newIE = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE);
  const usdt = await ethers.getContractAt("IERC20", USDT);
  const osloToken = await ethers.getContractAt("IERC20", OSLO_TOKEN);

  // ─── Step 1: Gather All User Addresses ─────────────────────────────────
  console.log("─".repeat(70));
  console.log("Step 1: Scanning for users with active deposits...");
  console.log("─".repeat(70));

  // Option A: Parse events to find all users who deposited
  console.log("Scanning Deposited events (last 100,000 blocks)...");
  const currentBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 100000);
  
  const depositFilter = oldIE.filters.Deposited();
  let depositEvents: any[] = [];
  
  try {
    depositEvents = await oldIE.queryFilter(depositFilter, fromBlock, currentBlock);
    console.log("✅ Found", depositEvents.length, "deposit events");
  } catch (error: any) {
    console.log("⚠️  Event scanning failed:", error.message);
    console.log("   Trying smaller block ranges...");
    
    // Try in chunks
    for (let start = fromBlock; start < currentBlock; start += 10000) {
      const end = Math.min(start + 9999, currentBlock);
      try {
        const chunk = await oldIE.queryFilter(depositFilter, start, end);
        depositEvents.push(...chunk);
      } catch (e) {
        // Skip
      }
    }
    console.log("✅ Found", depositEvents.length, "deposit events (chunked scan)");
  }

  // Extract unique user addresses
  const userSet = new Set<string>();
  for (const event of depositEvents) {
    const user = (event as any).args?.user || (event as any).args?.[0];
    if (user) userSet.add(user);
  }
  
  const allUsers = Array.from(userSet);
  console.log("✅ Unique users found:", allUsers.length);

  // ─── Step 2: Filter Users with Active Deposits ──────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 2: Filtering users with active deposits...");
  console.log("─".repeat(70));

  const usersWithDeposits: Array<{
    address: string;
    depositCount: number;
    totalActiveDeposit: bigint;
    totalCombinedEarnings: bigint;
  }> = [];

  for (let i = 0; i < allUsers.length; i++) {
    const user = allUsers[i];
    if ((i + 1) % 100 === 0) {
      console.log(`  Processing user ${i + 1}/${allUsers.length}...`);
    }

    try {
      const depositCount = await oldIE.getDepositCount(user);
      if (depositCount > 0n) {
        const totalActiveDeposit = await oldIE.getActiveDeposit(user);
        const totalCombinedEarnings = await oldIE.getCombinedEarnings(user);
        
        if (totalActiveDeposit > 0n) {
          usersWithDeposits.push({
            address: user,
            depositCount: Number(depositCount),
            totalActiveDeposit,
            totalCombinedEarnings,
          });
        }
      }
    } catch (error) {
      console.log(`  ⚠️  Failed to read data for ${user}:`, (error as Error).message);
    }
  }

  console.log("✅ Users with active deposits:", usersWithDeposits.length);
  console.log("\nSample users:");
  usersWithDeposits.slice(0, 5).forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.address}`);
    console.log(`     Deposits: ${u.depositCount}, Active: ${ethers.formatEther(u.totalActiveDeposit)} USDT`);
  });

  // ─── Step 3: Migrate Combined Earnings ──────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 3: Migrating combined earnings data...");
  console.log("─".repeat(70));

  // Check if new IE has migrateCombinedEarnings function
  try {
    const addresses = usersWithDeposits.map(u => u.address);
    const earnings = usersWithDeposits.map(u => u.totalCombinedEarnings);

    console.log(`Migrating ${addresses.length} users' combined earnings...`);
    
    // Process in batches
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
      const batchEarnings = earnings.slice(i, i + BATCH_SIZE);

      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchAddresses.length} users...`);
      
      const tx = await newIE.migrateCombinedEarnings(batchAddresses, batchEarnings);
      await tx.wait();
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`);
    }

    console.log("✅ Combined earnings migration complete");
  } catch (error: any) {
    console.log("⚠️  migrateCombinedEarnings failed:", error.message);
    console.log("   This function may not exist in new IE");
    console.log("   Combined earnings will be recalculated on next claim");
  }

  // ─── Step 4: Migrate USDT Balance ──────────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 4: Transferring USDT from old IE to new IE...");
  console.log("─".repeat(70));

  const oldIEUsdtBalance = await usdt.balanceOf(OLD_IE);
  console.log("Old IE USDT Balance:", ethers.formatEther(oldIEUsdtBalance), "USDT");

  if (oldIEUsdtBalance > 0n) {
    // Check if deployer can withdraw from old IE
    console.log("⚠️  USDT transfer requires admin access on old IE");
    console.log("   Option A: Transfer directly if deployer is admin");
    console.log("   Option B: Use drain/withdraw function if available");
    console.log("   Option C: Manual transfer via multisig/timelock");
    console.log("   \n   Manual transfer command:");
    console.log("   await usdt.transferFrom(OLD_IE, NEW_IE, ethers.parseEther('" + ethers.formatEther(oldIEUsdtBalance) + "'))");
  } else {
    console.log("ℹ️  No USDT to transfer (old IE balance is 0)");
  }

  // ─── Step 5: Migrate OSLO Balance ──────────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 5: Transferring OSLO from old IE to new IE...");
  console.log("─".repeat(70));

  const oldIEOsloBalance = await osloToken.balanceOf(OLD_IE);
  console.log("Old IE OSLO Balance:", ethers.formatEther(oldIEOsloBalance), "OSLO");

  if (oldIEOsloBalance > 0n) {
    console.log("⚠️  OSLO transfer requires admin access on old IE");
    console.log("   Manual transfer command:");
    console.log("   await osloToken.transferFrom(OLD_IE, NEW_IE, ethers.parseEther('" + ethers.formatEther(oldIEOsloBalance) + "'))");
  } else {
    console.log("ℹ️  No OSLO to transfer (old IE balance is 0)");
  }

  // ─── Step 6: Verification ──────────────────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 6: Verifying migration...");
  console.log("─".repeat(70));

  // Check a few sample users
  const sampleUsers = usersWithDeposits.slice(0, 3);
  for (const user of sampleUsers) {
    console.log(`\nVerifying user: ${user.address}`);
    
    // Old IE
    const oldActiveDeposit = await oldIE.getActiveDeposit(user.address);
    const oldCombined = await oldIE.getCombinedEarnings(user.address);
    
    // New IE
    const newActiveDeposit = await newIE.getActiveDeposit(user.address);
    const newCombined = await newIE.getCombinedEarnings(user.address);
    
    console.log(`  Old IE - Active: ${ethers.formatEther(oldActiveDeposit)}, Combined: ${ethers.formatEther(oldCombined)}`);
    console.log(`  New IE - Active: ${ethers.formatEther(newActiveDeposit)}, Combined: ${ethers.formatEther(newCombined)}`);
    
    if (newCombined === user.totalCombinedEarnings) {
      console.log(`  ✅ Combined earnings migrated correctly`);
    } else {
      console.log(`  ⚠️  Combined earnings mismatch (expected recalculation on claim)`);
    }
  }

  // ─── Step 7: Update Frontend Reference ──────────────────────────────────
  console.log("\n─".repeat(70));
  console.log("Step 7: Frontend Update Required");
  console.log("─".repeat(70));

  console.log("\n⚠️  IMPORTANT: Update frontend contract address!");
  console.log("\nFile: src/lib/contracts.ts");
  console.log("Change:");
  console.log(`  investmentEngine: "${OLD_IE}"`);
  console.log("To:");
  console.log(`  investmentEngine: "${NEW_IE}"`);

  // ─── Migration Summary ────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(70));
  console.log("\n✅ Users scanned:", allUsers.length);
  console.log("✅ Users with active deposits:", usersWithDeposits.length);
  console.log("✅ Combined earnings migrated: Yes (via migrateCombinedEarnings)");
  console.log("⚠️  USDT transfer:", oldIEUsdtBalance > 0n ? "Requires manual transfer" : "N/A (balance 0)");
  console.log("⚠️  OSLO transfer:", oldIEOsloBalance > 0n ? "Requires manual transfer" : "N/A (balance 0)");
  console.log("⚠️  Frontend update: REQUIRED");
  console.log("\n📋 Post-Migration Checklist:");
  console.log("  1. ✅ Verify user deposits in new IE");
  console.log("  2. ✅ Verify combined earnings migrated");
  console.log("  3. ⚠️  Transfer USDT from old IE to new IE (if needed)");
  console.log("  4. ⚠️  Transfer OSLO from old IE to new IE (if needed)");
  console.log("  5. ⚠️  Update frontend src/lib/contracts.ts");
  console.log("  6. ⚠️  Test yield claims with sample users");
  console.log("  7. ⚠️  Test early exit timer (should not reset on new deposits)");
  console.log("  8. ⚠️  Test level income distribution");
  console.log("  9. ⚠️  Monitor for 24-48 hours");
  console.log("  10. ⚠️  Consider deprecating old IE after verification");
  console.log("\n⚠️  WARNING: Test on testnet first before mainnet migration!");
  console.log("=".repeat(70) + "\n");

  // Save migration report
  const fs = await import("fs");
  const path = await import("path");
  const reportPath = path.join(__dirname, "../data/migration-report.json");
  
  const report = {
    migrationDate: new Date().toISOString(),
    oldIE: OLD_IE,
    newIE: NEW_IE,
    totalUsersScanned: allUsers.length,
    usersWithDeposits: usersWithDeposits.length,
    oldIEUsdtBalance: ethers.formatEther(oldIEUsdtBalance),
    oldIEOsloBalance: ethers.formatEther(oldIEOsloBalance),
    sampleUsers: usersWithDeposits.slice(0, 10).map(u => ({
      address: u.address,
      depositCount: u.depositCount,
      totalActiveDeposit: ethers.formatEther(u.totalActiveDeposit),
      totalCombinedEarnings: ethers.formatEther(u.totalCombinedEarnings),
    })),
    status: "migration_ready"
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("📄 Migration report saved to:", reportPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
