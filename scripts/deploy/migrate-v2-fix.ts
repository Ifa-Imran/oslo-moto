import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * V2 → V2.1 Migration: Fix totalEarnings > accruedYield
 *
 * The V1→V2 migration used proportional distribution of totalClaimed across
 * stakes, which could assign totalEarnings > accruedYield to individual stakes
 * (when totalClaimed included yield from inactive stakes).
 *
 * This script:
 *   1. Reads ALL state from current V2
 *   2. Deploys a fresh V2 (same contract code, new address)
 *   3. Migrates with CORRECTED formula:
 *      - corrected_totalEarnings = min(totalEarnings, accruedYield) per stake
 *      - excess = old_totalEarnings - corrected → added to seededEarnings
 *      - externalEarnings preserved
 *      - totalClaimed preserved
 *   4. Wires permissions
 *   5. Verifies 0 affected wallets
 *   6. Updates .env.local
 *
 * Usage: npx hardhat run scripts/deploy/migrate-v2-fix.ts --network bscMainnet
 */

// ============ CURRENT V2 CONTRACTS (TO BE REPLACED) ============
const OLD_V2_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0";
const OLD_V2_DAO = "0xe8a7301d627c2C31Ed3BBFE9C04B7f6DFA9e406A";

// ============ KEPT CONTRACTS ============
const OSLO_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const LEVEL_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const LB_ADDR = "0xE05c36e61B81E34d7063627280dE8a9c4CD96e64";

// ============ WALLETS ============
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

// ============ KNOWN ROOTS ============
const KNOWN_ROOTS = [
  "0xb259fcC202b17C124201C872c52f108ade380B4F",
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4",
  "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56",
  "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4",
];

// ============ ABI ============
const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
  "function grantRole(bytes32 role, address account) external",
  "function setLeadershipBonus(address) external",
  "function setDAOContract(address) external",
  "function setRewardWallet(address) external",
  "function pause() external",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function getDirectDownlines(address) view returns (address[])",
];

const ROLE_ABI = [
  "function grantRole(bytes32, address) external",
  "function revokeRole(bytes32, address) external",
];

const SET_ENGINE_ABI = ["function setInvestmentEngine(address) external"];
const DAO_WRITE_ABI = ["function setReferralRegistry(address) external"];

// ============ YIELD CALCULATION ============
const TIER1_RATES = [100, 75, 95, 65, 100, 85, 55];
const TIER2_RATES = [115, 100, 115, 110, 105, 100, 125];
const ONE_DAY = 86400n;

interface StakeData {
  activeStake: bigint;
  totalEarnings: bigint;
  stakeStartTime: bigint;
  stakeDayIndex: number;
  tier: number;
  referrer: string;
  isActive: boolean;
}

function calculateStakeYield(s: StakeData, ts: bigint): bigint {
  if (!s.isActive) return 0n;
  const elapsed = ts - s.stakeStartTime;
  const days = elapsed / ONE_DAY;
  const rem = elapsed % ONE_DAY;
  let y = 0n;
  const rates = s.tier === 1 ? TIER1_RATES : TIER2_RATES;
  for (let i = 0n; i < days; i++) {
    const idx = Number((BigInt(s.stakeDayIndex) + i) % 7n);
    y += (s.activeStake * BigInt(rates[idx])) / 10000n;
  }
  if (rem > 0n && days < 365n) {
    const idx = Number((BigInt(s.stakeDayIndex) + days) % 7n);
    const daily = (s.activeStake * BigInt(rates[idx])) / 10000n;
    y += (daily * rem) / ONE_DAY;
  }
  return y;
}

// ============ ROLE CONSTANTS ============
const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

function jsonStringify(obj: any, indent?: number): string {
  return JSON.stringify(obj, (_k, v) => typeof v === "bigint" ? v.toString() : v, indent);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("V2 → V2.1 MIGRATION: Fix totalEarnings > accruedYield");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BNB: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const oldEngine = new ethers.Contract(OLD_V2_ENGINE, ENGINE_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);

  // ---- Read V2 protocol stats ----
  const [v2Users, v2Active, v2Turnover] = await Promise.all([
    oldEngine.totalUsers(),
    oldEngine.totalActiveStakes(),
    oldEngine.totalProtocolTurnover(),
  ]);
  console.log(`V2 stats: ${v2Users} users, ${ethers.formatUnits(v2Active, 18)} active, ${ethers.formatUnits(v2Turnover, 18)} turnover`);

  // ---- Traverse referral tree ----
  console.log("\nTraversing referral tree...");
  const allUsers = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const root of KNOWN_ROOTS) {
    if (await registry.isRegistered(root).catch(() => false)) {
      queue.push(root);
      allUsers.add(root);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    try {
      const dl = await registry.getDirectDownlines(cur);
      for (const d of dl) { allUsers.add(d); if (!visited.has(d)) queue.push(d); }
    } catch {}
  }
  console.log(`Found ${allUsers.size} wallets`);

  // ---- Read all user state from V2 ----
  console.log("Reading V2 state...");
  const currentTimestamp = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);

  interface UserState {
    address: string;
    stakes: StakeData[];
    totalClaimed: bigint;
    seededEarnings: bigint;
    externalEarnings: bigint;
  }

  const users: UserState[] = [];
  let count = 0;
  for (const user of allUsers) {
    if (++count % 20 === 0) console.log(`  Progress: ${count}/${allUsers.size}`);
    try {
      const hasStaked = await oldEngine.hasStaked(user);
      if (!hasStaked) continue;
      const [stakes, claimed, seeded, external] = await Promise.all([
        oldEngine.getUserStakes(user),
        oldEngine.totalClaimed(user),
        oldEngine.seededEarnings(user),
        oldEngine.externalEarnings(user),
      ]);
            if (stakes.length === 0) continue;
      // Explicitly convert all fields from ethers Result to plain types
      users.push({
        address: user,
        stakes: stakes.map((s: any) => ({
          activeStake: BigInt(s.activeStake),
          totalEarnings: BigInt(s.totalEarnings),
          stakeStartTime: BigInt(s.stakeStartTime),
          stakeDayIndex: Number(s.stakeDayIndex),
          tier: Number(s.tier),
          referrer: String(s.referrer),
          isActive: Boolean(s.isActive),
        })),
        totalClaimed: BigInt(claimed),
        seededEarnings: BigInt(seeded),
        externalEarnings: BigInt(external),
      });
    } catch {}
  }
  console.log(`Read ${users.length} users with stakes`);

  // ---- Pause old V2 ----
  console.log("\nPausing old V2...");
  try { await (await oldEngine.pause()).wait(); console.log("  Old V2 paused"); }
  catch { console.log("  WARN: Could not pause old V2"); }

  // ---- Deploy new V2 + DAO ----
  console.log("\nDeploying V2.1...");
  const Factory = await ethers.getContractFactory("InvestmentEngineV2");
  const newEngine = await Factory.deploy(
    USDT_ADDR, OSLO_ADDR, DEX_ADDR, VAULT_ADDR, REGISTRY_ADDR, LEVEL_ADDR, COMPANY_WALLET, PERF_WALLET
  );
  await newEngine.waitForDeployment();
  const newEngineAddr = await newEngine.getAddress();
  console.log(`  InvestmentEngineV2.1: ${newEngineAddr}`);

  const DaoFactory = await ethers.getContractFactory("OsloDAO");
  const newDao = await DaoFactory.deploy(USDT_ADDR, newEngineAddr);
  await newDao.waitForDeployment();
  const newDaoAddr = await newDao.getAddress();
  console.log(`  OsloDAO: ${newDaoAddr}`);

  // ---- Wire permissions ----
  console.log("\nWiring permissions...");
  const tokenC = new ethers.Contract(OSLO_ADDR, ROLE_ABI, deployer);
  const dexC = new ethers.Contract(DEX_ADDR, ROLE_ABI, deployer);
  const vaultC = new ethers.Contract(VAULT_ADDR, ROLE_ABI, deployer);
  const levelC = new ethers.Contract(LEVEL_ADDR, ROLE_ABI, deployer);
  const lbC = new ethers.Contract(LB_ADDR, ROLE_ABI, deployer);
  const engineC = new ethers.Contract(newEngineAddr, ENGINE_ABI, deployer);
  const daoC = new ethers.Contract(newDaoAddr, DAO_WRITE_ABI, deployer);

  // Revoke old V2 roles
  try { await tokenC.revokeRole(BURNER_ROLE, OLD_V2_ENGINE); } catch {}
  try { await dexC.revokeRole(ENGINE_ROLE, OLD_V2_ENGINE); } catch {}
  try { await vaultC.revokeRole(ENGINE_ROLE, OLD_V2_ENGINE); } catch {}
  try { await levelC.revokeRole(ENGINE_ROLE, OLD_V2_ENGINE); } catch {}
  try { await lbC.revokeRole(ENGINE_ROLE, OLD_V2_ENGINE); } catch {}

  // Grant new V2.1 roles
  await tokenC.grantRole(BURNER_ROLE, newEngineAddr);
  await dexC.grantRole(ENGINE_ROLE, newEngineAddr);
  await vaultC.grantRole(ENGINE_ROLE, newEngineAddr);
  await levelC.grantRole(ENGINE_ROLE, newEngineAddr);
  await lbC.grantRole(ENGINE_ROLE, newEngineAddr);

  // Roles on new engine
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LEVEL_ADDR);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LB_ADDR);
  await engineC.setLeadershipBonus(LB_ADDR);
  await engineC.setDAOContract(newDaoAddr);
  await engineC.setRewardWallet(REWARD_WALLET);

  // Update engine pointers
  await new ethers.Contract(LEVEL_ADDR, SET_ENGINE_ABI, deployer).setInvestmentEngine(newEngineAddr);
  await new ethers.Contract(LB_ADDR, SET_ENGINE_ABI, deployer).setInvestmentEngine(newEngineAddr);

  // Set registry on DAO
  await daoC.setReferralRegistry(REGISTRY_ADDR);
  console.log("  Permissions wired");

  // ---- Migrate with CORRECTED formula ----
  console.log("\nMigrating with corrected totalEarnings formula...");
  console.log("  corrected_totalEarnings = min(totalEarnings, accruedYield)");
  console.log("  excess → seededEarnings (preserves 3X cap)");

  let migrated = 0, failed = 0;
  const failedUsers: string[] = [];

  for (const user of users) {
    const addr = `${user.address.slice(0, 8)}...${user.address.slice(-6)}`;
    try {
      // Safety: skip if already migrated
      const hasStaked = await engineC.hasStaked(user.address);
      if (hasStaked) { console.log(`  SKIP: ${addr}`); continue; }

      // Calculate corrected totalEarnings per stake
      let totalExcess = 0n;
      const correctedTEs: bigint[] = [];

      for (const s of user.stakes) {
        const accrued = calculateStakeYield(s, currentTimestamp);
        const corrected = s.totalEarnings < accrued ? s.totalEarnings : accrued;
        const excess = s.totalEarnings - corrected;
        correctedTEs.push(corrected);
        totalExcess += excess;
      }

      // Import each stake with corrected totalEarnings
      for (let i = 0; i < user.stakes.length; i++) {
        const s = user.stakes[i];
        const tx = await engineC.adminImportStake(
          user.address, s.activeStake, correctedTEs[i], s.stakeStartTime,
          s.stakeDayIndex, s.tier, s.referrer, s.isActive
        );
        await tx.wait();
      }

      // Set seededEarnings (original + excess from capping)
      const newSeeded = user.seededEarnings + totalExcess;
      if (newSeeded > 0n) {
        await (await engineC.adminSetSeededEarnings(user.address, newSeeded)).wait();
      }

      // Set externalEarnings (unchanged)
      if (user.externalEarnings > 0n) {
        await (await engineC.adminSetExternalEarnings(user.address, user.externalEarnings)).wait();
      }

      // Set totalClaimed (unchanged)
      if (user.totalClaimed > 0n) {
        await (await engineC.adminSeedClaimed(user.address, user.totalClaimed)).wait();
      }

      migrated++;
      if (migrated % 10 === 0) console.log(`  Progress: ${migrated}/${users.length}`);
    } catch (e: any) {
      if (e.message?.includes("insufficient funds")) {
        console.log(`  OUT OF BNB! Stopped at ${migrated + 1}/${users.length}`);
        return;
      }
      console.log(`  FAIL: ${addr} — ${e.message?.substring(0, 100)}`);
      failedUsers.push(user.address);
      failed++;
    }
  }

  console.log(`\nMigrated: ${migrated}, Failed: ${failed}`);

  // ---- Verify ----
  console.log("\n========== VERIFY ==========");
  const newRead = new ethers.Contract(newEngineAddr, ENGINE_ABI, deployer);
  const [newUsers, newActive, newTurnover] = await Promise.all([
    newRead.totalUsers(), newRead.totalActiveStakes(), newRead.totalProtocolTurnover(),
  ]);
  console.log(`  Users: ${v2Users} → ${newUsers} ${v2Users === newUsers ? "✓" : "✗"}`);
  console.log(`  Active: ${ethers.formatUnits(v2Active, 18)} → ${ethers.formatUnits(newActive, 18)} ${v2Active === newActive ? "✓" : "✗"}`);
  console.log(`  Turnover: ${ethers.formatUnits(v2Turnover, 18)} → ${ethers.formatUnits(newTurnover, 18)} ${v2Turnover === newTurnover ? "✓" : "✗"}`);

  // Check previously affected wallets
  console.log("\n  Checking previously affected wallets:");
  let stillBlocked = 0;
  for (const user of users) {
    const claimable = await newRead.getClaimableYield(user.address);
    const accrued = await newRead.calculateAccruedYield(user.address);
    if (claimable === 0n && accrued > 0n) {
      stillBlocked++;
      console.log(`    BLOCKED: ${user.address.slice(0, 10)}... accrued=${ethers.formatUnits(accrued, 18)}`);
    }
  }
  if (stillBlocked === 0) {
    console.log("    ✅ ALL wallets are now claimable!");
  } else {
    console.log(`    ⚠️  ${stillBlocked} wallets still blocked`);
  }

  // ---- Update .env.local ----
  console.log("\n========== UPDATE .env.local ==========");
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(/NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/g, `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${newEngineAddr}`);
  envContent = envContent.replace(/NEXT_PUBLIC_OSLO_DAO_ADDRESS=.*/g, `NEXT_PUBLIC_OSLO_DAO_ADDRESS=${newDaoAddr}`);
  fs.writeFileSync(envPath, envContent);
  console.log("  .env.local updated");

  // ---- Summary ----
  console.log("\n" + "=".repeat(70));
  console.log("V2.1 MIGRATION COMPLETE");
  console.log("=".repeat(70));
  console.log(`  InvestmentEngineV2.1: ${newEngineAddr}`);
  console.log(`  OsloDAO:               ${newDaoAddr}`);
  console.log(`  Old V2 (deprecated):   ${OLD_V2_ENGINE} (PAUSED)`);
  console.log(`  Old V2 DAO:            ${OLD_V2_DAO}`);
  console.log(`  Users migrated:        ${migrated}/${users.length}`);
  console.log(`  Users failed:          ${failed}`);
  console.log(`  Still blocked:         ${stillBlocked}`);
  console.log("=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
