import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");

// Already deployed addresses
const USDT = "0x6B12531B41D57623a44Ca764DEF901636dd974ff";
const OSLO = "0x7Af10a7486fF36AF857bb394E4314A74bdfeE174";
const LM_ADDR = "0x72Ef4478BF40C44b5529E7727837211eD6dC4044";
const DEX_ADDR = "0x65B53678843012DdfbB25f6D39d8aEa520a73958";
const IE_ADDR = "0x64bc0A032a35473a3a5eFc76513F86AB73eE09A5";
const REF_ADDR = "0x56E54C0BcC1D7312e2246987Bb9a9004a66Dda20";
const RANK_ADDR = "0x3347Cd3E5F4617aA6d1837aCc25e2C181f0eB93b";
const TREASURY_ADDR = "0x9e69c03820774883BA9CA2235a21C14A907C0924";
const DAO_ADDR = "0x2c708566D8cf3d71B185867712F4B0aCE5c623A0";

// Resume from deposit index 45 (already migrated 0-44)
const DEPOSIT_START_INDEX = 45;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  console.log("V5 RESUME — from deposit 226");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(admin)), "BNB");

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);
  const ref = await ethers.getContractAt("OSLOReferral", REF_ADDR);
  const rank = await ethers.getContractAt("OSLORankSystem", RANK_ADDR);
  const treasury = await ethers.getContractAt("OSLOTreasury", TREASURY_ADDR);
  const dao = await ethers.getContractAt("OSLODAO", DAO_ADDR);
  const oslo = await ethers.getContractAt("OSLOToken", OSLO);

  let tx;
  const BATCH_SIZE = 20;
  const DEP_BATCH = 15;

  // ═══════════════════════════════════════════════════════════════════
  // 16. CONTINUE DEPOSITS (from index 225)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n16. Continuing deposits from index", DEPOSIT_START_INDEX);
  const deposits = snapshot.deposits;
  const remainingDeposits = deposits.slice(DEPOSIT_START_INDEX);
  console.log(`  Remaining: ${remainingDeposits.length} deposits`);

  for (let i = 0; i < remainingDeposits.length; i += DEP_BATCH) {
    const batch = remainingDeposits.slice(i, i + DEP_BATCH);
    const entries = batch.map((d: any) => ({
      owner: d.owner,
      amount: ethers.parseEther(d.amount),
      tier: d.tier,
      dailyRate: d.dailyRate,
      depositTime: d.depositTime,
      lastClaimTime: d.lastClaimTime,
      totalClaimed: ethers.parseEther(d.totalClaimed),
      maxReturn: ethers.parseEther(d.maxReturn),
    }));
    tx = await ie.migrateDeposits(entries);
    await tx.wait();
    console.log(`  ✓ Deposits ${DEPOSIT_START_INDEX + i + 1}-${DEPOSIT_START_INDEX + Math.min(i + DEP_BATCH, remainingDeposits.length)}`);
  }
  console.log(`  ✓ All deposits migrated`);

  // ═══════════════════════════════════════════════════════════════════
  // 17. MIGRATE COMBINED EARNINGS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n17. Migrating combined earnings...");
  const ceUsers: string[] = [];
  const ceAmounts: bigint[] = [];

  for (const u of snapshot.users) {
    const ce = parseFloat(u.totalCombinedEarnings);
    if (ce > 0) {
      ceUsers.push(u.address);
      ceAmounts.push(ethers.parseEther(u.totalCombinedEarnings));
    }
  }

  if (ceUsers.length > 0) {
    for (let i = 0; i < ceUsers.length; i += BATCH_SIZE) {
      const bU = ceUsers.slice(i, i + BATCH_SIZE);
      const bA = ceAmounts.slice(i, i + BATCH_SIZE);
      tx = await ie.migrateCombinedEarnings(bU, bA);
      await tx.wait();
      console.log(`  ✓ CombinedEarnings batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }
  }
  console.log(`  ${ceUsers.length} users with combined earnings`);

  // ═══════════════════════════════════════════════════════════════════
  // 18. Complete setup
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n18. Finalizing setup");
  const completions = [
    { name: "IE", c: ie },
    { name: "Referral", c: ref },
    { name: "Rank", c: rank },
    { name: "Treasury", c: treasury },
    { name: "DAO", c: dao },
    { name: "OSLOToken", c: oslo },
  ];
  for (const { name, c } of completions) {
    tx = await c.completeSetup();
    await tx.wait();
    console.log(`  ✓ ${name}.completeSetup()`);
  }

  // Save addresses
  const addresses = {
    network: "bscTestnet",
    chainId: 97,
    deployedAt: new Date().toISOString(),
    deployer: admin,
    USDT,
    OSLOToken: OSLO,
    OSLODEX: DEX_ADDR,
    OSLOTreasury: TREASURY_ADDR,
    OSLOLiquidityManager: LM_ADDR,
    OSLODAO: DAO_ADDR,
    OSLORankSystem: RANK_ADDR,
    OSLOReferral: REF_ADDR,
    OSLOInvestmentEngine: IE_ADDR,
  };
  fs.writeFileSync(
    path.join(__dirname, "../data/testnet-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n" + "═".repeat(60));
  console.log("V5 MIGRATION COMPLETE");
  console.log("═".repeat(60));
  console.log("All 280 deposits + 78 users migrated");
  console.log("New referral rates: L1=30%, L2=20%, L3-10=10%, L11-20=5%");
  console.log("═".repeat(60));

  console.log("\n// === contracts.ts snippet ===");
  console.log(`  osloToken:           "${OSLO}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine:    "${IE_ADDR}" as \`0x\${string}\`,`);
  console.log(`  referral:            "${REF_ADDR}" as \`0x\${string}\`,`);
  console.log(`  rankSystem:          "${RANK_ADDR}" as \`0x\${string}\`,`);
  console.log(`  dao:                 "${DAO_ADDR}" as \`0x\${string}\`,`);
  console.log(`  treasury:            "${TREASURY_ADDR}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager:    "${LM_ADDR}" as \`0x\${string}\`,`);
  console.log(`  osloDEX:             "${DEX_ADDR}" as \`0x\${string}\`,`);
  console.log(`  usdt:                "${USDT}" as \`0x\${string}\`,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
