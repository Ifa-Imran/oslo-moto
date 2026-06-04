import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * OSLO Protocol — Mainnet V3 Deployment (Consolidated Vault)
 * ===========================================================
 * Network: BSC Mainnet (chainId: 56)
 * USDT: Real BSC USDT (0x55d398326f99059fF775485246999027B3197955)
 * Data: testnet-final-snapshot.json (79 users, 280 deposits → consolidated pools)
 * Admin: Kept open (NO completeSetup)
 *
 * What this script does:
 *   Phase 0: Extract OSLO from old DEX (via processDeposit trick)
 *   Phase 1: Deploy OSLODexV2 + OSLOVault
 *   Phase 2: Configure both contracts
 *   Phase 3: Configure OSLOToken (whitelist + disable old sell endpoint)
 *   Phase 4: Fund vault with OSLO for yield reserves
 *   Phase 5: Migrate 79 users (consolidate 280 deposits → per-user pools)
 *   Phase 6: Point old DEX investmentEngine to new vault
 *
 * Run: npx hardhat run scripts/deploy-mainnet-v3.ts --network bscMainnet
 */

// ─── Constants ───────────────────────────────────────────────────────────────
const LAUNCH_TIMESTAMP = 1_778_371_200; // May 10, 2026 00:00:00 UTC
const SNAPSHOT_PATH = path.join(__dirname, "../data/testnet-final-snapshot.json");
const ADDRESSES_PATH = path.join(__dirname, "../data/mainnet-v3-addresses.json");

// BSC Mainnet addresses (existing contracts)
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const OLD_DEX = "0xCBa239e2aE0b7d84A156399ea1791C1Dd70b5e52";
const OLD_IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const RANK_SYSTEM = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";

// Fee wallets
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";

// OSLO allocation
const OSLO_TO_VAULT = ethers.parseEther("3500000"); // 3.5M OSLO for yield reserves

// Batch sizes
const MIGRATION_BATCH = 20;
const EARNINGS_BATCH = 40;

// Gas price
const GAS_PRICE = ethers.parseUnits("1", "gwei");

// ERC20 ABI subset
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// Old DEX ABI (needed for processDeposit + setInvestmentEngine)
const OLD_DEX_ABI = [
  "function setInvestmentEngine(address _investmentEngine) external",
  "function processDeposit(uint256 usdtAmount) external returns (uint256 osloAmount)",
  "function investmentEngine() view returns (address)",
  "function timelock() view returns (address)",
  "function getReserves() view returns (uint256, uint256)",
];

// OSLOToken ABI subset
const OSLO_TOKEN_ABI = [
  "function setTaxWhitelist(address account, bool whitelisted) external",
  "function setSellEndpoint(address endpoint, bool status) external",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function admin() view returns (address)",
  "function isTaxWhitelisted(address) view returns (bool)",
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

interface SnapshotDeposit {
  owner: string;
  index: number;
  amount: string;
  tier: number;
  dailyRate: number;
  depositTime: number;
  lastClaimTime: number;
  totalClaimed: string;
  maxReturn: string;
  active: boolean;
}

interface SnapshotUser {
  address: string;
  referrer: string;
  unlockedLevels: number;
  totalEarned: string;
  totalActiveDeposit: string;
  depositCount: number;
  totalCombinedEarnings: string;
}

interface ConsolidatedPool {
  owner: string;
  totalBalance: bigint;
  lastClaimTime: number;
  totalClaimed: bigint;
  totalCombinedEarnings: bigint;
  lastDepositTime: number;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  const txOpts = { gasPrice: GAS_PRICE };

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   OSLO PROTOCOL — MAINNET V3 DEPLOYMENT (Consolidated)     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("Network:  BSC Mainnet (chainId: 56)");
  console.log("Deployer:", admin);

  const bnbBalance = ethers.formatEther(await ethers.provider.getBalance(admin));
  console.log("BNB Balance:", bnbBalance);

  // Check USDT + OSLO balance
  const usdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, deployer);
  const osloContract = new ethers.Contract(OSLO_TOKEN, OSLO_TOKEN_ABI, deployer);
  const usdtBal = await usdtContract.balanceOf(admin);
  const osloBal = await osloContract.balanceOf(admin);
  console.log("USDT Balance:", ethers.formatEther(usdtBal));
  console.log("OSLO Balance:", ethers.formatEther(osloBal));

  // Load snapshot
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  console.log(`\nSnapshot: ${snapshot.users.length} users, ${snapshot.deposits.length} deposits`);

  let progress = loadProgress();

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 0: EXTRACT OSLO FROM OLD DEX
  // ═══════════════════════════════════════════════════════════════════
  if (!progress || !progress.osloExtracted) {
    console.log("\n── Phase 0: Extract OSLO from old DEX ──");
    const oldDex = new ethers.Contract(OLD_DEX, OLD_DEX_ABI, deployer);

    // Check old DEX reserves
    const [oldUsdtRes, oldOsloRes] = await oldDex.getReserves();
    console.log("  Old DEX USDT Reserve:", ethers.formatEther(oldUsdtRes));
    console.log("  Old DEX OSLO Reserve:", ethers.formatEther(oldOsloRes));

    // Check current IE on old DEX
    const currentIE = await oldDex.investmentEngine();
    console.log("  Current IE on old DEX:", currentIE);

    // Step 1: Set deployer as investmentEngine on old DEX
    if (currentIE.toLowerCase() !== admin.toLowerCase()) {
      console.log("  Setting deployer as investmentEngine on old DEX...");
      await sendTx(oldDex.setInvestmentEngine(admin, txOpts));
      console.log("  ✓ Deployer is now investmentEngine on old DEX");
    }

    // Step 2: Approve USDT to old DEX and call processDeposit
    const extractAmount = ethers.parseEther("50"); // $50 USDT
    const currentUsdtBal = await usdtContract.balanceOf(admin);
    if (currentUsdtBal < extractAmount) {
      console.log("  ⚠ Deployer needs at least $50 USDT for extraction. Current:", ethers.formatEther(currentUsdtBal));
      console.log("  ⚠ Skipping extraction — you can resume after funding.");
      // Save partial progress
      if (!progress) progress = {};
      progress.osloExtracted = false;
      saveProgress(progress);
      return;
    }

    console.log("  Approving USDT to old DEX...");
    await sendTx(usdtContract.approve(OLD_DEX, extractAmount, txOpts));

    console.log("  Calling processDeposit($50) to extract OSLO...");
    await sendTx(oldDex.processDeposit(extractAmount, txOpts));

    const osloAfter = await osloContract.balanceOf(admin);
    console.log("  ✓ OSLO extracted. New OSLO balance:", ethers.formatEther(osloAfter));

    if (!progress) progress = {};
    progress.osloExtracted = true;
    progress.osloBalance = ethers.formatEther(osloAfter);
    saveProgress(progress);
  } else {
    console.log("\n── Phase 0: OSLO already extracted ──");
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: DEPLOY V3 CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  let DEX_V2_ADDR: string;
  let VAULT_ADDR: string;

  if (!progress.OSLODexV2) {
    console.log("\n── Phase 1: Deploy V3 contracts ──");

    const DexV2Factory = await ethers.getContractFactory("OSLODexV2");
    const dexV2 = await DexV2Factory.deploy(BSC_USDT, OSLO_TOKEN, txOpts);
    await dexV2.waitForDeployment();
    DEX_V2_ADDR = await dexV2.getAddress();
    console.log("  1. OSLODexV2:", DEX_V2_ADDR);

    const VaultFactory = await ethers.getContractFactory("OSLOVault");
    const vault = await VaultFactory.deploy(BSC_USDT, OSLO_TOKEN, LAUNCH_TIMESTAMP, txOpts);
    await vault.waitForDeployment();
    VAULT_ADDR = await vault.getAddress();
    console.log("  2. OSLOVault:", VAULT_ADDR);

    progress.OSLODexV2 = DEX_V2_ADDR;
    progress.OSLOVault = VAULT_ADDR;
    progress.status = "deployed";
    saveProgress(progress);
  } else {
    DEX_V2_ADDR = progress.OSLODexV2;
    VAULT_ADDR = progress.OSLOVault;
    console.log("\n── Phase 1: Already deployed ──");
    console.log("  OSLODexV2:", DEX_V2_ADDR);
    console.log("  OSLOVault:", VAULT_ADDR);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: CONFIGURE CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "deployed") {
    console.log("\n── Phase 2: Configure contracts ──");

    const dexV2 = await ethers.getContractAt("OSLODexV2", DEX_V2_ADDR);
    const vault = await ethers.getContractAt("OSLOVault", VAULT_ADDR);

    // Configure DEX: vault + timelock (deployer)
    await sendTx(dexV2.configure(VAULT_ADDR, admin, txOpts));
    console.log("  ✓ DEX configured (vault + timelock)");

    // Configure Vault: dex, referral, rankSystem, timelock
    await sendTx(vault.configure(DEX_V2_ADDR, REFERRAL, RANK_SYSTEM, admin, txOpts));
    console.log("  ✓ Vault configured (dex, referral, rankSystem, timelock)");

    // Set reward wallets
    await sendTx(vault.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET, txOpts));
    console.log("  ✓ Reward wallets set");

    progress.status = "configured";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: CONFIGURE OSLO TOKEN
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "configured") {
    console.log("\n── Phase 3: Configure OSLOToken ──");

    // Whitelist new DEX (transfers FROM DEX don't get taxed)
    await sendTx(osloContract.setTaxWhitelist(DEX_V2_ADDR, true, txOpts));
    console.log("  ✓ New DEX whitelisted on OSLOToken");

    // Whitelist new Vault
    await sendTx(osloContract.setTaxWhitelist(VAULT_ADDR, true, txOpts));
    console.log("  ✓ New Vault whitelisted on OSLOToken");

    // Disable old DEX as sell endpoint
    await sendTx(osloContract.setSellEndpoint(OLD_DEX, false, txOpts));
    console.log("  ✓ Old DEX disabled as sell endpoint");

    progress.status = "token_configured";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: FUND VAULT WITH OSLO
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "token_configured") {
    console.log("\n── Phase 4: Fund vault with OSLO ──");

    const currentOslo = await osloContract.balanceOf(admin);
    console.log("  Deployer OSLO balance:", ethers.formatEther(currentOslo));

    const toTransfer = currentOslo < OSLO_TO_VAULT ? currentOslo : OSLO_TO_VAULT;
    if (toTransfer > 0n) {
      await sendTx(osloContract.transfer(VAULT_ADDR, toTransfer, txOpts));
      console.log("  ✓ Transferred", ethers.formatEther(toTransfer), "OSLO to vault");
    } else {
      console.log("  ⚠ No OSLO to transfer — vault will self-fund from deposits");
    }

    progress.status = "funded";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: MIGRATE USERS (Consolidate deposits → per-user pools)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "funded") {
    console.log("\n── Phase 5: Migrate users (consolidated pools) ──");

    const deposits: SnapshotDeposit[] = snapshot.deposits;
    const users: SnapshotUser[] = snapshot.users;

    // Build consolidated pools per user
    const poolMap = new Map<string, ConsolidatedPool>();

    for (const dep of deposits) {
      if (!dep.active) continue; // Skip inactive deposits
      const owner = dep.owner;
      const existing = poolMap.get(owner);
      const amount = ethers.parseEther(dep.amount);
      const claimed = ethers.parseEther(dep.totalClaimed);

      if (existing) {
        existing.totalBalance += amount;
        existing.totalClaimed += claimed;
        existing.lastClaimTime = Math.max(existing.lastClaimTime, dep.lastClaimTime);
        existing.lastDepositTime = Math.max(existing.lastDepositTime, dep.depositTime);
      } else {
        poolMap.set(owner, {
          owner,
          totalBalance: amount,
          lastClaimTime: dep.lastClaimTime,
          totalClaimed: claimed,
          totalCombinedEarnings: 0n,
          lastDepositTime: dep.depositTime,
        });
      }
    }

    // Merge totalCombinedEarnings from user records
    for (const user of users) {
      const pool = poolMap.get(user.address);
      if (pool && parseFloat(user.totalCombinedEarnings) > 0) {
        pool.totalCombinedEarnings = ethers.parseEther(user.totalCombinedEarnings);
      }
    }

    const pools = Array.from(poolMap.values()).filter(p => p.totalBalance > 0n);
    console.log(`  Consolidated ${deposits.length} deposits → ${pools.length} user pools`);

    // Migrate in batches
    const vault = await ethers.getContractAt("OSLOVault", VAULT_ADDR);
    const startOffset = progress.migrationOffset || 0;

    for (let i = startOffset; i < pools.length; i += MIGRATION_BATCH) {
      const batch = pools.slice(i, i + MIGRATION_BATCH);
      const entries = batch.map(p => ({
        owner: p.owner,
        totalBalance: p.totalBalance,
        lastClaimTime: p.lastClaimTime,
        totalClaimed: p.totalClaimed,
        totalCombinedEarnings: p.totalCombinedEarnings,
        lastDepositTime: p.lastDepositTime,
      }));

      await sendTx(vault.migrateConsolidated(entries, txOpts));
      const end = Math.min(i + MIGRATION_BATCH, pools.length);
      console.log(`  ✓ Migrated pools ${i + 1}-${end}`);

      progress.migrationOffset = end;
      saveProgress(progress);
    }

    // Migrate combined earnings for users with non-zero values
    const ceUsers: string[] = [];
    const ceAmounts: bigint[] = [];
    for (const user of users) {
      if (parseFloat(user.totalCombinedEarnings) > 0) {
        ceUsers.push(user.address);
        ceAmounts.push(ethers.parseEther(user.totalCombinedEarnings));
      }
    }

    if (ceUsers.length > 0) {
      for (let i = 0; i < ceUsers.length; i += EARNINGS_BATCH) {
        const end = Math.min(i + EARNINGS_BATCH, ceUsers.length);
        await sendTx(vault.migrateCombinedEarnings(
          ceUsers.slice(i, end),
          ceAmounts.slice(i, end),
          txOpts
        ));
        console.log(`  ✓ CombinedEarnings ${i + 1}-${end}`);
      }
    }

    delete progress.migrationOffset;
    progress.status = "migrated";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 6: POINT OLD DEX TO NEW VAULT
  // ═══════════════════════════════════════════════════════════════════
  if (progress.status === "migrated") {
    console.log("\n── Phase 6: Point old DEX to new vault ──");

    const oldDex = new ethers.Contract(OLD_DEX, OLD_DEX_ABI, deployer);
    await sendTx(oldDex.setInvestmentEngine(VAULT_ADDR, txOpts));
    console.log("  ✓ Old DEX investmentEngine → new Vault");

    progress.status = "complete";
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FINAL OUTPUT
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("OSLO PROTOCOL — MAINNET V3 DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log("USDT (BSC):       ", BSC_USDT);
  console.log("OSLOToken:        ", OSLO_TOKEN);
  console.log("OSLODexV2 (new):  ", DEX_V2_ADDR);
  console.log("OSLOVault (new):  ", VAULT_ADDR);
  console.log("Referral:         ", REFERRAL);
  console.log("RankSystem:       ", RANK_SYSTEM);
  console.log("Old DEX:          ", OLD_DEX);
  console.log("Old IE:           ", OLD_IE);
  console.log("═".repeat(60));
  console.log(`Users migrated: ${snapshot.users.length}`);
  console.log(`Deposits consolidated: ${snapshot.deposits.length}`);
  console.log("═".repeat(60));

  console.log("\n⚠️  Admin kept OPEN (completeSetup NOT called)");
  console.log("⚠️  DEX NOT seeded — do manually:");
  console.log("   1. osloToken.approve(dexV2, osloAmount)");
  console.log("   2. usdt.approve(dexV2, usdtAmount)");
  console.log("   3. dexV2.addInitialLiquidity(usdtAmount, osloAmount)");

  // Print frontend snippet
  console.log("\n// === Update frontend/src/lib/contracts.ts ===");
  console.log(`export const CONTRACTS = {`);
  console.log(`  osloToken:        "${OSLO_TOKEN}" as \`0x\${string}\`,`);
  console.log(`  osloDEX:          "${DEX_V2_ADDR}" as \`0x\${string}\`,`);
  console.log(`  osloVault:        "${VAULT_ADDR}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${VAULT_ADDR}" as \`0x\${string}\`,`);
  console.log(`  referral:         "${REFERRAL}" as \`0x\${string}\`,`);
  console.log(`  rankSystem:       "${RANK_SYSTEM}" as \`0x\${string}\`,`);
  console.log(`  dao:              "0x708C360721baabb9FA982b37c79Fd3E21e374FEF" as \`0x\${string}\`,`);
  console.log(`  treasury:         "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF" as \`0x\${string}\`,`);
  console.log(`  liquidityManager: "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E" as \`0x\${string}\`,`);
  console.log(`  usdt:             "${BSC_USDT}" as \`0x\${string}\`,`);
  console.log(`} as const;`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
