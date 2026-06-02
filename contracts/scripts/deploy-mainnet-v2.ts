import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * OSLO Protocol — Mainnet V2 Deployment Script
 * ==============================================
 * Network: BSC Mainnet (chainId: 56)
 * USDT: Real BSC USDT (0x55d398326f99059fF775485246999027B3197955)
 * Data: testnet-final-snapshot.json (78 users, 280 deposits)
 * Admin: Kept open (NO completeSetup)
 *
 * Prerequisites:
 *   - Deployer wallet has ~0.5 BNB for gas
 *   - Deployer wallet has ~11,000 USDT (drained from old contracts)
 *
 * Run: npx hardhat run scripts/deploy-mainnet-v2.ts --network bscMainnet
 */

// ─── Constants ───────────────────────────────────────────────────────────────
const LAUNCH_TIMESTAMP = 1_778_371_200; // May 10, 2026 00:00:00 UTC
const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");
const ADDRESSES_PATH = path.join(__dirname, "../data/mainnet-v2-addresses.json");

// Real BSC Mainnet USDT
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

// OSLO allocations (DEX liquidity seeded MANUALLY after deploy)
const OSLO_TO_IE = ethers.parseEther("11000000");   // 11M OSLO for rewards
const OSLO_TO_LM = ethers.parseEther("100000");     // 100K OSLO for DEX liquidity

// Batch sizes (optimized for gas)
const USER_BATCH = 40;
const DEPOSIT_BATCH = 50;
const EARNINGS_BATCH = 40;

// BSC Mainnet: 1 gwei is minimum (saves ~66% gas cost vs 3 gwei)
const GAS_PRICE = ethers.parseUnits("1", "gwei");

// Minimal ERC20 ABI for real USDT interaction (used post-deploy for seeding)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function sendTx(tx: any) {
  const resp = await tx;
  await resp.wait();
  return resp;
}

function loadProgress(): any {
  if (fs.existsSync(ADDRESSES_PATH)) {
    return JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf-8"));
  }
  return null;
}

function saveProgress(data: any) {
  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(data, null, 2));
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   OSLO PROTOCOL — MAINNET V2 DEPLOYMENT                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("Network:  BSC Mainnet (chainId: 56)");
  console.log("Deployer:", admin);

  const bnbBalance = ethers.formatEther(await ethers.provider.getBalance(admin));
  console.log("BNB Balance:", bnbBalance);

  // Check USDT balance
  const usdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, deployer);
  const usdtBalance = await usdtContract.balanceOf(admin);
  console.log("USDT Balance:", ethers.formatEther(usdtBalance));

  // Load snapshot
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  console.log(`\nSnapshot: ${snapshot.users.length} users, ${snapshot.deposits.length} deposits`);

  const txOpts = { gasPrice: GAS_PRICE };

  // Check for resumable state
  let progress = loadProgress();

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1-8: DEPLOY CONTRACTS (skip MockUSDT — using real BSC USDT)
  // ═══════════════════════════════════════════════════════════════════
  let OSLO: string, LM_ADDR: string, DEX_ADDR: string, IE_ADDR: string;
  let REF_ADDR: string, RANK_ADDR: string, TREASURY_ADDR: string, DAO_ADDR: string;

  if (progress && progress.OSLOToken) {
    console.log("\n── Resuming from saved addresses ──");
    OSLO = progress.OSLOToken;
    LM_ADDR = progress.OSLOLiquidityManager;
    DEX_ADDR = progress.OSLODEX;
    IE_ADDR = progress.OSLOInvestmentEngine;
    REF_ADDR = progress.OSLOReferral;
    RANK_ADDR = progress.OSLORankSystem;
    TREASURY_ADDR = progress.OSLOTreasury;
    DAO_ADDR = progress.OSLODAO;
    console.log("  All contracts already deployed, skipping...");
  } else {
    console.log("\n── Deploying 8 contracts (using real USDT) ──");

    const OSLOToken = await ethers.getContractFactory("OSLOToken");
    const oslo = await OSLOToken.deploy(txOpts);
    await oslo.waitForDeployment();
    OSLO = await oslo.getAddress();
    console.log("  1. OSLOToken:", OSLO);

    const LM = await ethers.getContractFactory("OSLOLiquidityManager");
    const lm = await LM.deploy(BSC_USDT, OSLO, txOpts);
    await lm.waitForDeployment();
    LM_ADDR = await lm.getAddress();
    console.log("  2. LiquidityManager:", LM_ADDR);

    const DEX = await ethers.getContractFactory("OSLODEX");
    const dex = await DEX.deploy(BSC_USDT, OSLO, txOpts);
    await dex.waitForDeployment();
    DEX_ADDR = await dex.getAddress();
    console.log("  3. OSLODEX:", DEX_ADDR);

    const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
    const ie = await IE.deploy(BSC_USDT, OSLO, LAUNCH_TIMESTAMP, txOpts);
    await ie.waitForDeployment();
    IE_ADDR = await ie.getAddress();
    console.log("  4. InvestmentEngine:", IE_ADDR);

    const REF = await ethers.getContractFactory("OSLOReferral");
    const ref = await REF.deploy(BSC_USDT, OSLO, txOpts);
    await ref.waitForDeployment();
    REF_ADDR = await ref.getAddress();
    console.log("  5. Referral:", REF_ADDR);

    const RANK = await ethers.getContractFactory("OSLORankSystem");
    const rank = await RANK.deploy(BSC_USDT, txOpts);
    await rank.waitForDeployment();
    RANK_ADDR = await rank.getAddress();
    console.log("  6. RankSystem:", RANK_ADDR);

    const TREASURY = await ethers.getContractFactory("OSLOTreasury");
    const treasury = await TREASURY.deploy(BSC_USDT, OSLO, txOpts);
    await treasury.waitForDeployment();
    TREASURY_ADDR = await treasury.getAddress();
    console.log("  7. Treasury:", TREASURY_ADDR);

    const DAO = await ethers.getContractFactory("OSLODAO");
    const dao = await DAO.deploy(BSC_USDT, txOpts);
    await dao.waitForDeployment();
    DAO_ADDR = await dao.getAddress();
    console.log("  8. DAO:", DAO_ADDR);

    // Save immediately after deploy for resumability
    progress = {
      network: "bscMainnet",
      chainId: 56,
      deployedAt: new Date().toISOString(),
      deployer: admin,
      USDT: BSC_USDT,
      OSLOToken: OSLO,
      OSLODEX: DEX_ADDR,
      OSLOTreasury: TREASURY_ADDR,
      OSLOLiquidityManager: LM_ADDR,
      OSLODAO: DAO_ADDR,
      OSLORankSystem: RANK_ADDR,
      OSLOReferral: REF_ADDR,
      OSLOInvestmentEngine: IE_ADDR,
      status: "contracts_deployed",
    };
    saveProgress(progress);
    console.log("  ✓ Addresses saved (resumable)");
  }

  // Attach to deployed contracts
  const oslo = await ethers.getContractAt("OSLOToken", OSLO);
  const lm = await ethers.getContractAt("OSLOLiquidityManager", LM_ADDR);
  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDR);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);
  const ref = await ethers.getContractAt("OSLOReferral", REF_ADDR);
  const rank = await ethers.getContractAt("OSLORankSystem", RANK_ADDR);
  const treasury = await ethers.getContractAt("OSLOTreasury", TREASURY_ADDR);
  const dao = await ethers.getContractAt("OSLODAO", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 9: WIRE ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "contracts_deployed") {
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

    progress.status = "wired";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 10: TOKEN CONFIG (whitelist + sell endpoints)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "wired") {
    console.log("\n── Token config ──");
    await sendTx(oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR, txOpts));
    const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
    for (const a of whitelist) {
      await sendTx(oslo.setTaxWhitelist(a, true, txOpts));
    }
    await sendTx(oslo.setSellEndpoint(DEX_ADDR, true, txOpts));
    console.log("  ✓ Whitelist + sell endpoint (9 txs)");

    progress.status = "token_configured";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 11: OSLO ALLOCATIONS (DEX seed done manually post-deploy)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "token_configured") {
    console.log("\n── OSLO Allocations ──");

    // Transfer OSLO to InvestmentEngine (11M for rewards)
    await sendTx(oslo.transfer(IE_ADDR, OSLO_TO_IE, txOpts));
    console.log("  ✓ 11M OSLO → InvestmentEngine");

    // Transfer OSLO to LiquidityManager (100K for DEX liquidity)
    await sendTx(oslo.transfer(LM_ADDR, OSLO_TO_LM, txOpts));
    console.log("  ✓ 100K OSLO → LiquidityManager");

    console.log("  ⚠ DEX NOT seeded — do manually after deploy:");
    console.log("    1. Transfer USDT to LiquidityManager");
    console.log("    2. Call lm.addInitialLiquidity(usdtAmount)");

    progress.status = "seeded";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 12: MIGRATE USERS (batch=40)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "seeded") {
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

    progress.status = "users_migrated";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 13: MIGRATE REFERRAL EARNINGS (batch=40)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "users_migrated") {
    console.log("\n── Migrating referral earnings ──");
    const users = snapshot.users;
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

    progress.status = "earnings_migrated";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 14: MIGRATE DEPOSITS (batch=50, resumable per-batch)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "earnings_migrated") {
    console.log("\n── Migrating deposits ──");
    const deposits = snapshot.deposits;
    const startOffset = progress.depositsOffset || 0;

    for (let i = startOffset; i < deposits.length; i += DEPOSIT_BATCH) {
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

      // Save offset after each batch for resumability
      progress.depositsOffset = end;
      saveProgress(progress);
    }

    progress.status = "deposits_migrated";
    delete progress.depositsOffset;
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 15: MIGRATE COMBINED EARNINGS (batch=40)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "deposits_migrated") {
    console.log("\n── Migrating combined earnings ──");
    const users = snapshot.users;
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

    progress.status = "complete";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // NOTE: completeSetup() is NOT called — admin stays open
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n⚠️  Admin kept OPEN (completeSetup NOT called)");
  console.log("   You retain admin access for drainUSDT, migrations, etc.");

  // ═══════════════════════════════════════════════════════════════════
  // FINAL OUTPUT
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("OSLO PROTOCOL — MAINNET V2 DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log("USDT (BSC):          ", BSC_USDT);
  console.log("OSLOToken:           ", OSLO);
  console.log("LiquidityManager:    ", LM_ADDR);
  console.log("OSLODEX:             ", DEX_ADDR);
  console.log("InvestmentEngine:    ", IE_ADDR);
  console.log("Referral:            ", REF_ADDR);
  console.log("RankSystem:          ", RANK_ADDR);
  console.log("Treasury:            ", TREASURY_ADDR);
  console.log("DAO:                 ", DAO_ADDR);
  console.log("═".repeat(60));
  console.log(`Users: ${snapshot.users.length} | Deposits: ${snapshot.deposits.length}`);
  console.log(`DEX: NOT seeded yet — seed manually with USDT + call addInitialLiquidity`);
  console.log("═".repeat(60));

  // Print frontend snippet
  console.log("\n// === Update frontend/src/lib/contracts.ts ===");
  console.log(`export const CONTRACTS = {`);
  console.log(`  osloToken:        "${OSLO}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${IE_ADDR}" as \`0x\${string}\`,`);
  console.log(`  referral:         "${REF_ADDR}" as \`0x\${string}\`,`);
  console.log(`  rankSystem:       "${RANK_ADDR}" as \`0x\${string}\`,`);
  console.log(`  dao:              "${DAO_ADDR}" as \`0x\${string}\`,`);
  console.log(`  treasury:         "${TREASURY_ADDR}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager: "${LM_ADDR}" as \`0x\${string}\`,`);
  console.log(`  osloDEX:          "${DEX_ADDR}" as \`0x\${string}\`,`);
  console.log(`  usdt:             "${BSC_USDT}" as \`0x\${string}\`,`);
  console.log(`} as const;`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
