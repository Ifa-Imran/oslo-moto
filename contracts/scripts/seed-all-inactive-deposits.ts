import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed ALL inactive deposits as active on testnet, EXCEPT:
 * 1. Top wallet (0x1d8896b5...) — already has 196 active deposits seeded
 * 2. Deposits with totalClaimed > 0 — genuine early exits
 * 3. Wallet 0x8F9D25D7... — already seeded separately
 */
async function main() {
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "testnet-addresses.json"), "utf-8")
  );
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "mainnet-snapshot.json"), "utf-8")
  );

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}\n`);

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", addresses.OSLOInvestmentEngine);

  // Skip these wallets
  const SKIP_WALLETS = new Set([
    "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4".toLowerCase(), // top wallet, already seeded
    "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8".toLowerCase(), // already seeded separately
  ]);

  // Find all inactive deposits that should be active (totalClaimed = 0)
  const toSeed: any[] = [];

  for (const dep of snapshot.deposits) {
    // Skip active deposits (already seeded by seed-mainnet-snapshot.ts)
    if (dep.active) continue;

    // Skip wallets we already handled
    if (SKIP_WALLETS.has(dep.owner.toLowerCase())) continue;

    // Skip genuine early exits (totalClaimed > 0)
    if (parseFloat(dep.totalClaimed) > 0) {
      console.log(`  SKIP (early exit): ${dep.owner.slice(0, 10)}... dep[${dep.index}] claimed=${dep.totalClaimed}`);
      continue;
    }

    toSeed.push(dep);
  }

  console.log(`\nFound ${toSeed.length} inactive deposits to seed as active:\n`);

  if (toSeed.length === 0) {
    console.log("Nothing to seed!");
    return;
  }

  // Check which wallets already have these deposits on testnet (avoid duplicates)
  const entries: any[] = [];

  for (const dep of toSeed) {
    const currentCount = await ie.getDepositCount(dep.owner);

    // Check if this specific deposit index already exists
    if (Number(currentCount) > dep.index) {
      console.log(`  SKIP (already exists): ${dep.owner.slice(0, 10)}... dep[${dep.index}]`);
      continue;
    }

    console.log(`  SEED: ${dep.owner.slice(0, 10)}... amount=${dep.amount} tier=${dep.tier} rate=${dep.dailyRate}`);

    entries.push({
      owner: dep.owner,
      amount: ethers.parseEther(dep.amount),
      tier: dep.tier,
      dailyRate: dep.dailyRate,
      depositTime: dep.depositTime,
      lastClaimTime: dep.lastClaimTime,
      totalClaimed: ethers.parseEther(dep.totalClaimed),
      maxReturn: ethers.parseEther(dep.maxReturn),
    });
  }

  if (entries.length === 0) {
    console.log("\nAll deposits already seeded!");
    return;
  }

  console.log(`\nMigrating ${entries.length} deposits in one batch...`);

  const tx = await ie.migrateDeposits(entries);
  console.log(`TX sent: ${tx.hash}`);
  await tx.wait();
  console.log("TX confirmed!\n");

  // Verify each wallet
  const wallets = [...new Set(entries.map((e: any) => e.owner))];
  for (const w of wallets) {
    const count = await ie.getDepositCount(w);
    const active = await ie.getActiveDeposit(w);
    console.log(`  ${w.slice(0, 10)}... deposits=${Number(count)} activeDeposit=${ethers.formatEther(active)} USDT`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
