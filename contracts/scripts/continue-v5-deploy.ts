import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");

// Deployed in step 1-9 of redeploy-v5
const USDT = "0x217565cbF9772E2A2F1FBd50aC7E673fa5980aFB";
const OSLO = "0x2Dc0e9ef353287D2D3880eF7F3Ee2386EF24F8d1";
const LM_ADDR = "0x23512bbf86a47c79F3194f5aC950a6E4113f5FC1";
const DEX_ADDR = "0xC1996eeeCbEeF5aB98d8eD501d3D02ec3d928942";
const IE_ADDR = "0xA6Ecd84D101630f0FaDe26D3aDfaB9364f44CD1B";
const REF_ADDR = "0xC9cbF61F09Fe9ae9EaB2553Aa13BE2f64C67112e";
const RANK_ADDR = "0x362f5E21426E2A1D4922A7853371761df7922188";
const TREASURY_ADDR = "0x2D7BAd0fB36A95465d7a85dF6822C2ef4b7fbE46";
const DAO_ADDR = "0x2d00EC2Cde140Ae8c7eeb8d34987aae4Ed53997E";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  console.log("V5 CONTINUATION — from step 11");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(admin)), "BNB");

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  console.log(`Snapshot: ${snapshot.users.length} users, ${snapshot.deposits.length} deposits`);

  // Attach to deployed contracts
  const oslo = await ethers.getContractAt("OSLOToken", OSLO);
  const usdt = await ethers.getContractAt("MockUSDT", USDT);
  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDR);
  const lm = await ethers.getContractAt("OSLOLiquidityManager", LM_ADDR);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);
  const ref = await ethers.getContractAt("OSLOReferral", REF_ADDR);
  const rank = await ethers.getContractAt("OSLORankSystem", RANK_ADDR);
  const treasury = await ethers.getContractAt("OSLOTreasury", TREASURY_ADDR);
  const dao = await ethers.getContractAt("OSLODAO", DAO_ADDR);

  let tx;

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken setup
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n11. OSLOToken config");
  tx = await oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR);
  await tx.wait();
  console.log("  ✓ setSellTaxAddresses");

  const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
  for (const a of whitelist) {
    tx = await oslo.setTaxWhitelist(a, true);
    await tx.wait();
  }
  tx = await oslo.setSellEndpoint(DEX_ADDR, true);
  await tx.wait();
  console.log("  ✓", whitelist.length, "addresses whitelisted + DEX sell endpoint");

  // ═══════════════════════════════════════════════════════════════════
  // 12. OSLO allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n12. OSLO allocations");
  tx = await oslo.transfer(IE_ADDR, ethers.parseEther("11000000"));
  await tx.wait();
  console.log("  ✓ 11M OSLO → IE");

  tx = await oslo.transfer(LM_ADDR, ethers.parseEther("100000"));
  await tx.wait();
  console.log("  ✓ 100K OSLO → LM");

  // ═══════════════════════════════════════════════════════════════════
  // 13. Seed DEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n13. Seed DEX");
  tx = await usdt.mint(admin, ethers.parseEther("100000"));
  await tx.wait();
  console.log("  ✓ 100K USDT minted");

  const seedUsdt = ethers.parseEther("1000");
  tx = await usdt.transfer(LM_ADDR, seedUsdt);
  await tx.wait();
  tx = await lm.addInitialLiquidity(seedUsdt);
  await tx.wait();
  const [rU, rO] = await dex.getReserves();
  console.log("  ✓ DEX seeded:", ethers.formatEther(rU), "USDT +", ethers.formatEther(rO), "OSLO");

  // ═══════════════════════════════════════════════════════════════════
  // 14. MIGRATE REFERRAL USERS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n14. Migrating referral users...");
  const users = snapshot.users;
  const BATCH_SIZE = 20;

  const userAddresses: string[] = [];
  const userReferrers: string[] = [];
  const userLevels: bigint[] = [];

  for (const u of users) {
    userAddresses.push(u.address);
    userReferrers.push(u.referrer);
    userLevels.push(BigInt(u.unlockedLevels));
  }

  for (let i = 0; i < userAddresses.length; i += BATCH_SIZE) {
    const bA = userAddresses.slice(i, i + BATCH_SIZE);
    const bR = userReferrers.slice(i, i + BATCH_SIZE);
    const bL = userLevels.slice(i, i + BATCH_SIZE);
    tx = await ref.migrateUsers(bA, bR, bL);
    await tx.wait();
    console.log(`  ✓ Users ${i + 1}-${Math.min(i + BATCH_SIZE, userAddresses.length)}`);
  }
  console.log(`  Total: ${userAddresses.length} users migrated`);

  // ═══════════════════════════════════════════════════════════════════
  // 15. MIGRATE REFERRAL EARNINGS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n15. Migrating referral earnings...");
  const earningUsers: string[] = [];
  const earningTotals: bigint[] = [];
  const earningRewards: bigint[] = [];

  for (const u of users) {
    const te = parseFloat(u.totalEarned);
    const rr = parseFloat(u.referralRewards);
    if (te > 0 || rr > 0) {
      earningUsers.push(u.address);
      earningTotals.push(ethers.parseEther(u.totalEarned));
      earningRewards.push(ethers.parseEther(u.referralRewards));
    }
  }

  if (earningUsers.length > 0) {
    for (let i = 0; i < earningUsers.length; i += BATCH_SIZE) {
      const bU = earningUsers.slice(i, i + BATCH_SIZE);
      const bT = earningTotals.slice(i, i + BATCH_SIZE);
      const bR = earningRewards.slice(i, i + BATCH_SIZE);
      tx = await ref.migrateEarnings(bU, bT, bR);
      await tx.wait();
      console.log(`  ✓ Earnings batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }
  }
  console.log(`  ${earningUsers.length} users with earnings migrated`);

  // ═══════════════════════════════════════════════════════════════════
  // 16. MIGRATE DEPOSITS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n16. Migrating deposits...");
  const deposits = snapshot.deposits;
  const DEP_BATCH = 15;

  for (let i = 0; i < deposits.length; i += DEP_BATCH) {
    const batch = deposits.slice(i, i + DEP_BATCH);
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
    console.log(`  ✓ Deposits ${i + 1}-${Math.min(i + DEP_BATCH, deposits.length)}`);
  }
  console.log(`  Total: ${deposits.length} deposits migrated`);

  // ═══════════════════════════════════════════════════════════════════
  // 17. MIGRATE COMBINED EARNINGS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n17. Migrating combined earnings...");
  const ceUsers: string[] = [];
  const ceAmounts: bigint[] = [];

  for (const u of users) {
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
  console.log("V5 DEPLOYMENT + MIGRATION COMPLETE");
  console.log("═".repeat(60));
  console.log("USDT:                ", USDT);
  console.log("OSLOToken:           ", OSLO);
  console.log("LiquidityManager:    ", LM_ADDR);
  console.log("OSLODEX:             ", DEX_ADDR);
  console.log("InvestmentEngine:    ", IE_ADDR);
  console.log("Referral:            ", REF_ADDR);
  console.log("RankSystem:          ", RANK_ADDR);
  console.log("Treasury:            ", TREASURY_ADDR);
  console.log("DAO:                 ", DAO_ADDR);
  console.log("═".repeat(60));
  console.log(`Users migrated:    ${userAddresses.length}`);
  console.log(`Deposits migrated: ${deposits.length}`);
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
