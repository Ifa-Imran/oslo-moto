import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;
const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");

// ─── Gas optimization: large batches, lower gas price ─────────────────
const USER_BATCH = 40;       // was 20
const DEPOSIT_BATCH = 50;    // was 15 — biggest savings here
const EARNINGS_BATCH = 40;   // was 20

const GAS_PRICE = ethers.parseUnits("3", "gwei"); // BSC testnet: 3 gwei is plenty

async function sendTx(tx: any) {
  const resp = await tx;
  await resp.wait();
  return resp;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  console.log("V6 OPTIMIZED REDEPLOY + MIGRATE");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(admin)), "BNB\n");

  // Load snapshot
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  console.log(`Snapshot: ${snapshot.users.length} users, ${snapshot.deposits.length} deposits`);

  const txOpts = { gasPrice: GAS_PRICE };

  // ═══════════════════════════════════════════════════════════════════
  // 1-9. DEPLOY ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Deploying 9 contracts ──");

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy(txOpts);
  await usdt.waitForDeployment();
  const USDT = await usdt.getAddress();
  console.log("  1. MockUSDT:", USDT);

  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const oslo = await OSLOToken.deploy(txOpts);
  await oslo.waitForDeployment();
  const OSLO = await oslo.getAddress();
  console.log("  2. OSLOToken:", OSLO);

  const LM = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = await LM.deploy(USDT, OSLO, txOpts);
  await lm.waitForDeployment();
  const LM_ADDR = await lm.getAddress();
  console.log("  3. LiquidityManager:", LM_ADDR);

  const DEX = await ethers.getContractFactory("OSLODEX");
  const dex = await DEX.deploy(USDT, OSLO, txOpts);
  await dex.waitForDeployment();
  const DEX_ADDR = await dex.getAddress();
  console.log("  4. OSLODEX:", DEX_ADDR);

  const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IE.deploy(USDT, OSLO, LAUNCH_TIMESTAMP, txOpts);
  await ie.waitForDeployment();
  const IE_ADDR = await ie.getAddress();
  console.log("  5. InvestmentEngine:", IE_ADDR);

  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT, OSLO, txOpts);
  await ref.waitForDeployment();
  const REF_ADDR = await ref.getAddress();
  console.log("  6. Referral:", REF_ADDR);

  const RANK = await ethers.getContractFactory("OSLORankSystem");
  const rank = await RANK.deploy(USDT, txOpts);
  await rank.waitForDeployment();
  const RANK_ADDR = await rank.getAddress();
  console.log("  7. RankSystem:", RANK_ADDR);

  const TREASURY = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await TREASURY.deploy(USDT, OSLO, txOpts);
  await treasury.waitForDeployment();
  const TREASURY_ADDR = await treasury.getAddress();
  console.log("  8. Treasury:", TREASURY_ADDR);

  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(USDT, txOpts);
  await dao.waitForDeployment();
  const DAO_ADDR = await dao.getAddress();
  console.log("  9. DAO:", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 10. WIRE ALL CONTRACTS (7 txs)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Wiring contracts ──");
  await sendTx(lm.configure(admin, DEX_ADDR, txOpts));
  await sendTx(dex.configure(admin, LM_ADDR, IE_ADDR, txOpts));
  await sendTx(dex.forceSetReferralContract(REF_ADDR, txOpts));
  await sendTx(ie.configure(TREASURY_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, admin, txOpts));
  await sendTx(ref.configure(IE_ADDR, DEX_ADDR, admin, txOpts));
  await sendTx(rank.configure(IE_ADDR, REF_ADDR, admin, txOpts));
  await sendTx(treasury.configure(RANK_ADDR, DAO_ADDR, LM_ADDR, admin, txOpts));
  await sendTx(dao.configure(admin, IE_ADDR, txOpts));
  console.log("  ✓ All wired (8 txs)");

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken whitelist + sell endpoints (consolidated)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Token config ──");
  await sendTx(oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR, txOpts));
  const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
  for (const a of whitelist) {
    await sendTx(oslo.setTaxWhitelist(a, true, txOpts));
  }
  await sendTx(oslo.setSellEndpoint(DEX_ADDR, true, txOpts));
  console.log("  ✓ Whitelist + sell endpoint (9 txs)");

  // ═══════════════════════════════════════════════════════════════════
  // 12. Token allocations + DEX seed (3 txs)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Allocations + DEX seed ──");
  await sendTx(oslo.transfer(IE_ADDR, ethers.parseEther("11000000"), txOpts));
  await sendTx(oslo.transfer(LM_ADDR, ethers.parseEther("100000"), txOpts));
  await sendTx(usdt.mint(admin, ethers.parseEther("100000"), txOpts));

  const seedUsdt = ethers.parseEther("1000");
  await sendTx(usdt.transfer(LM_ADDR, seedUsdt, txOpts));
  await sendTx(lm.addInitialLiquidity(seedUsdt, txOpts));
  const [rU, rO] = await dex.getReserves();
  console.log(`  ✓ DEX seeded: ${ethers.formatEther(rU)} USDT + ${ethers.formatEther(rO)} OSLO`);

  // ═══════════════════════════════════════════════════════════════════
  // 13. MIGRATE USERS (batch=40 → ~2 txs for 78 users)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Migrating users ──");
  const users = snapshot.users;
  const userAddresses = users.map((u: any) => u.address);
  const userReferrers = users.map((u: any) => u.referrer);
  const userLevels = users.map((u: any) => BigInt(u.unlockedLevels));

  for (let i = 0; i < userAddresses.length; i += USER_BATCH) {
    const end = Math.min(i + USER_BATCH, userAddresses.length);
    await sendTx(ref.migrateUsers(
      userAddresses.slice(i, end),
      userReferrers.slice(i, end),
      userLevels.slice(i, end),
      txOpts
    ));
    console.log(`  ✓ Users ${i + 1}-${end}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 14. MIGRATE REFERRAL EARNINGS (batch=40)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Migrating referral earnings ──");
  const earningUsers: string[] = [];
  const earningTotals: bigint[] = [];
  const earningRewards: bigint[] = [];

  for (const u of users) {
    if (parseFloat(u.totalEarned) > 0 || parseFloat(u.referralRewards) > 0) {
      earningUsers.push(u.address);
      earningTotals.push(ethers.parseEther(u.totalEarned));
      earningRewards.push(ethers.parseEther(u.referralRewards));
    }
  }

  for (let i = 0; i < earningUsers.length; i += EARNINGS_BATCH) {
    const end = Math.min(i + EARNINGS_BATCH, earningUsers.length);
    await sendTx(ref.migrateEarnings(
      earningUsers.slice(i, end),
      earningTotals.slice(i, end),
      earningRewards.slice(i, end),
      txOpts
    ));
    console.log(`  ✓ Earnings ${i + 1}-${end}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 15. MIGRATE DEPOSITS (batch=50 → ~6 txs for 280 deposits)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Migrating deposits ──");
  const deposits = snapshot.deposits;

  for (let i = 0; i < deposits.length; i += DEPOSIT_BATCH) {
    const batch = deposits.slice(i, i + DEPOSIT_BATCH);
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
    await sendTx(ie.migrateDeposits(entries, txOpts));
    const end = Math.min(i + DEPOSIT_BATCH, deposits.length);
    console.log(`  ✓ Deposits ${i + 1}-${end}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 16. MIGRATE COMBINED EARNINGS (batch=40)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Migrating combined earnings ──");
  const ceUsers: string[] = [];
  const ceAmounts: bigint[] = [];

  for (const u of users) {
    if (parseFloat(u.totalCombinedEarnings) > 0) {
      ceUsers.push(u.address);
      ceAmounts.push(ethers.parseEther(u.totalCombinedEarnings));
    }
  }

  for (let i = 0; i < ceUsers.length; i += EARNINGS_BATCH) {
    const end = Math.min(i + EARNINGS_BATCH, ceUsers.length);
    await sendTx(ie.migrateCombinedEarnings(
      ceUsers.slice(i, end),
      ceAmounts.slice(i, end),
      txOpts
    ));
    console.log(`  ✓ CombinedEarnings ${i + 1}-${end}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 17. Complete setup (6 txs)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n── Finalizing ──");
  for (const { name, c } of [
    { name: "IE", c: ie },
    { name: "Referral", c: ref },
    { name: "Rank", c: rank },
    { name: "Treasury", c: treasury },
    { name: "DAO", c: dao },
    { name: "OSLOToken", c: oslo },
  ]) {
    await sendTx(c.completeSetup(txOpts));
    console.log(`  ✓ ${name}.completeSetup()`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DONE - Save addresses
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
  console.log("V6 OPTIMIZED DEPLOY COMPLETE");
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
  console.log(`Users: ${userAddresses.length} | Deposits: ${deposits.length} | Gas: 3 gwei`);
  console.log("═".repeat(60));

  // contracts.ts snippet for frontend
  console.log("\n// === frontend/src/lib/contracts.ts ===");
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
