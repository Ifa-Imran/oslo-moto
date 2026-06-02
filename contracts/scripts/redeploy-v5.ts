import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;
const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  console.log("V5 FULL REDEPLOY + MIGRATE — Updated referral commissions");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(admin)), "BNB");

  // Load snapshot
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  console.log(`Snapshot loaded: ${snapshot.users.length} users, ${snapshot.deposits.length} deposits`);

  // ═══════════════════════════════════════════════════════════════════
  // 1. MockUSDT
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n1. MockUSDT");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const USDT = await usdt.getAddress();
  console.log("  ", USDT);

  // ═══════════════════════════════════════════════════════════════════
  // 2. OSLOToken
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n2. OSLOToken");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const oslo = await OSLOToken.deploy();
  await oslo.waitForDeployment();
  const OSLO = await oslo.getAddress();
  console.log("  ", OSLO);

  // ═══════════════════════════════════════════════════════════════════
  // 3. OSLOLiquidityManager
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n3. OSLOLiquidityManager");
  const LM = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = await LM.deploy(USDT, OSLO);
  await lm.waitForDeployment();
  const LM_ADDR = await lm.getAddress();
  console.log("  ", LM_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 4. OSLODEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n4. OSLODEX");
  const DEX = await ethers.getContractFactory("OSLODEX");
  const dex = await DEX.deploy(USDT, OSLO);
  await dex.waitForDeployment();
  const DEX_ADDR = await dex.getAddress();
  console.log("  ", DEX_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 5. OSLOInvestmentEngine
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n5. OSLOInvestmentEngine");
  const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IE.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE_ADDR = await ie.getAddress();
  console.log("  ", IE_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 6. OSLOReferral
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n6. OSLOReferral");
  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT, OSLO);
  await ref.waitForDeployment();
  const REF_ADDR = await ref.getAddress();
  console.log("  ", REF_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 7. OSLORankSystem
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n7. OSLORankSystem");
  const RANK = await ethers.getContractFactory("OSLORankSystem");
  const rank = await RANK.deploy(USDT);
  await rank.waitForDeployment();
  const RANK_ADDR = await rank.getAddress();
  console.log("  ", RANK_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 8. OSLOTreasury
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n8. OSLOTreasury");
  const TREASURY = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await TREASURY.deploy(USDT, OSLO);
  await treasury.waitForDeployment();
  const TREASURY_ADDR = await treasury.getAddress();
  console.log("  ", TREASURY_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 9. OSLODAO
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n9. OSLODAO");
  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(USDT);
  await dao.waitForDeployment();
  const DAO_ADDR = await dao.getAddress();
  console.log("  ", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 10. WIRE ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n10. Wiring all contracts");
  let tx;

  tx = await lm.configure(admin, DEX_ADDR);
  await tx.wait();
  console.log("  ✓ LM → DEX");

  tx = await dex.configure(admin, LM_ADDR, IE_ADDR);
  await tx.wait();
  tx = await dex.forceSetReferralContract(REF_ADDR);
  await tx.wait();
  console.log("  ✓ DEX → LM + IE + Referral");

  tx = await ie.configure(TREASURY_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, admin);
  await tx.wait();
  console.log("  ✓ IE → Treasury + Referral + Rank + DEX");

  tx = await ref.configure(IE_ADDR, DEX_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Referral → IE + DEX");

  tx = await rank.configure(IE_ADDR, REF_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Rank → IE + Referral");

  tx = await treasury.configure(RANK_ADDR, DAO_ADDR, LM_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Treasury → Rank + DAO + LM");

  tx = await dao.configure(admin, IE_ADDR);
  await tx.wait();
  console.log("  ✓ DAO → IE");

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken setup
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n11. OSLOToken config");
  tx = await oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR);
  await tx.wait();

  const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
  for (const a of whitelist) {
    tx = await oslo.setTaxWhitelist(a, true);
    await tx.wait();
  }
  tx = await oslo.setSellEndpoint(DEX_ADDR, true);
  await tx.wait();
  console.log("  ✓", whitelist.length, "addresses whitelisted + DEX sell endpoint");

  // ═══════════════════════════════════════════════════════════════════
  // 12. Transfer OSLO allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n12. OSLO allocations");
  tx = await oslo.transfer(IE_ADDR, ethers.parseEther("11000000"));
  await tx.wait();
  console.log("  ✓ 11,000,000 OSLO → IE");

  tx = await oslo.transfer(LM_ADDR, ethers.parseEther("100000"));
  await tx.wait();
  console.log("  ✓ 100,000 OSLO → LM");

  // ═══════════════════════════════════════════════════════════════════
  // 13. Seed DEX with liquidity matching snapshot
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n13. Seed DEX");
  // Mint enough USDT for seeding + deployer balance
  tx = await usdt.mint(admin, ethers.parseEther("100000"));
  await tx.wait();

  // Seed DEX with $1000 initial (same as before — gives initial price)
  const seedUsdt = ethers.parseEther("1000");
  tx = await usdt.transfer(LM_ADDR, seedUsdt);
  await tx.wait();
  tx = await lm.addInitialLiquidity(seedUsdt);
  await tx.wait();
  const [rU, rO] = await dex.getReserves();
  console.log("  ✓ DEX seeded:", ethers.formatEther(rU), "USDT +", ethers.formatEther(rO), "OSLO");

  // ═══════════════════════════════════════════════════════════════════
  // 14. MIGRATE REFERRAL USERS (before completeSetup)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n14. Migrating referral users...");
  
  // Sort users so that referrers come before their referees (BFS order from snapshot)
  const users = snapshot.users;
  const BATCH_SIZE = 20;
  
  // Build ordered list: roots first, then depth-first
  const userAddresses: string[] = [];
  const userReferrers: string[] = [];
  const userLevels: bigint[] = [];
  
  for (const u of users) {
    userAddresses.push(u.address);
    userReferrers.push(u.referrer);
    userLevels.push(BigInt(u.unlockedLevels));
  }

  // Migrate in batches
  for (let i = 0; i < userAddresses.length; i += BATCH_SIZE) {
    const batchAddrs = userAddresses.slice(i, i + BATCH_SIZE);
    const batchRefs = userReferrers.slice(i, i + BATCH_SIZE);
    const batchLevels = userLevels.slice(i, i + BATCH_SIZE);
    tx = await ref.migrateUsers(batchAddrs, batchRefs, batchLevels);
    await tx.wait();
    console.log(`  ✓ Migrated users ${i + 1}-${Math.min(i + BATCH_SIZE, userAddresses.length)}`);
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
  // 16. MIGRATE DEPOSITS (IE)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n16. Migrating deposits...");
  const deposits = snapshot.deposits;
  const DEP_BATCH = 15; // smaller batches for complex struct

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
  // 17. MIGRATE COMBINED EARNINGS (IE)
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
  console.log(`  ${ceUsers.length} users with combined earnings migrated`);

  // ═══════════════════════════════════════════════════════════════════
  // 18. Complete setup on all contracts
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

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
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
  console.log("V5 FULL REDEPLOYMENT + MIGRATION COMPLETE");
  console.log("═".repeat(60));
  console.log("MockUSDT:            ", USDT);
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

  // contracts.ts snippet
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
