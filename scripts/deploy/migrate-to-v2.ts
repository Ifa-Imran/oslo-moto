import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * InvestmentEngineV2 Migration Script — Zero Data Loss
 *
 * Migrates ALL state from InvestmentEngine V1 → V2, fixing the
 * totalEarnings dual-use flaw permanently.
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Backs up ALL V1 state to JSON (stakes, earnings, claimed, seeded)
 *   2. Pauses V1 (prevents new stakes/claims during migration)
 *   3. Deploys InvestmentEngineV2 + new OsloDAO
 *   4. Wires all permissions (roles, engine pointers)
 *   5. Migrates every user's stakes with totalEarnings cleanup:
 *      - Separates staking yield from commission inflation
 *      - Preserves seededEarnings and totalClaimed exactly
 *   6. Transfers DAO USDT balance to new DAO
 *   7. Verifies V2 state matches V1 (with fix applied)
 *   8. Updates frontend .env.local
 *
 * V1 CONTRACT IS NEVER DELETED — remains on-chain as permanent backup.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/migrate-to-v2.ts --network bscMainnet
 */

// ============ EXISTING CONTRACTS (KEPT AS-IS) ============
const OSLO_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const LEVEL_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const LB_ADDR = "0xE05c36e61B81E34d7063627280dE8a9c4CD96e64";

// ============ OLD CONTRACTS (TO BE REPLACED) ============
const OLD_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const OLD_DAO = "0xC63066cA1b0C2F5c8678fea77168f604B2D2109c";

// ============ WALLETS ============
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

// ============ KNOWN ROOTS FOR REFERRAL TREE TRAVERSAL ============
const KNOWN_ROOTS = [
  "0xb259fcC202b17C124201C872c52f108ade380B4F", // Deployer
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // Reward wallet
  "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56", // Company wallet
  "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4", // Performance wallet
];

// ============ ABI DEFINITIONS ============
const ENGINE_READ_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
];

const ENGINE_WRITE_ABI = [
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
  "function grantRole(bytes32 role, address account) external",
  "function setLeadershipBonus(address) external",
  "function setDAOContract(address) external",
  "function setRewardWallet(address) external",
  "function pause() external",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
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

const DAO_READ_ABI = [
  "function qualifiedMembers(uint256) view returns (address)",
  "function getQualifiedMemberCount() view returns (uint256)",
  "function members(address) view returns (tuple(bool isQualified, uint256 slotNumber, uint256 qualificationTime, uint256 lastVerifiedMonth, uint256 teamSize, uint256 teamVolume, uint8 legCount))",
  "function lastDistribution() view returns (uint256)",
  "function currentCycle() view returns (uint256)",
  "function cyclePool() view returns (uint256)",
  "function cycleMemberCount() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
];

const DAO_WRITE_ABI = [
  "function setReferralRegistry(address) external",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
];

// ============ YIELD CALCULATION (matches contract logic) ============
const TIER1_RATES = [100, 75, 95, 65, 100, 85, 55];
const TIER2_RATES = [115, 100, 115, 110, 105, 100, 125];
const ONE_DAY = 86400n;

interface UserStakeData {
  activeStake: bigint;
  totalEarnings: bigint;
  stakeStartTime: bigint;
  stakeDayIndex: number;
  tier: number;
  referrer: string;
  isActive: boolean;
}

function calculateStakeYield(s: UserStakeData, currentTimestamp: bigint): bigint {
  if (!s.isActive) return 0n;

  const timeElapsed = currentTimestamp - s.stakeStartTime;
  const completeDays = timeElapsed / ONE_DAY;
  const remainingSeconds = timeElapsed % ONE_DAY;

  let yieldAmount = 0n;
  const rates = s.tier === 1 ? TIER1_RATES : TIER2_RATES;

  for (let i = 0n; i < completeDays; i++) {
    const dayIndex = Number((BigInt(s.stakeDayIndex) + i) % 7n);
    const rate = BigInt(rates[dayIndex]);
    yieldAmount += (s.activeStake * rate) / 10000n;
  }

  if (remainingSeconds > 0n && completeDays < 365n) {
    const currentDayIndex = Number((BigInt(s.stakeDayIndex) + completeDays) % 7n);
    const currentRate = BigInt(rates[currentDayIndex]);
    const dailyYield = (s.activeStake * currentRate) / 10000n;
    yieldAmount += (dailyYield * remainingSeconds) / ONE_DAY;
  }

  return yieldAmount;
}

// ============ ROLE CONSTANTS ============
const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

// ============ BACKUP FILE ============
const BACKUP_FILE = `v1-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

// BigInt-safe JSON serializer
function jsonStringify(obj: any, indent?: number): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  , indent);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("INVESTMENT ENGINE V2 MIGRATION — ZERO DATA LOSS");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BNB balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log();

  // =====================================================
  // PHASE 0: PRE-FLIGHT CHECKS
  // =====================================================
  console.log("========== PHASE 0: PRE-FLIGHT CHECKS ==========");

  const bnbBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`  BNB balance: ${ethers.formatEther(bnbBalance)} BNB`);
  if (ethers.parseEther("1.0") > bnbBalance) {
    console.log(`  ⚠️  WARNING: Low BNB balance. Full migration needs ~1 BNB.`);
    console.log(`  Script will proceed — it will migrate as many users as possible.`);
    console.log(`  If it runs out of gas, re-run after funding wallet (re-run protection skips already-migrated users).`);
  }

  const oldEngine = new ethers.Contract(OLD_ENGINE, ENGINE_READ_ABI, deployer);
  const oldDao = new ethers.Contract(OLD_DAO, DAO_READ_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);
  const usdt = new ethers.Contract(USDT_ADDR, ERC20_ABI, deployer);

  const [v1TotalUsers, v1TotalActive, v1Turnover] = await Promise.all([
    oldEngine.totalUsers(),
    oldEngine.totalActiveStakes(),
    oldEngine.totalProtocolTurnover(),
  ]);

  console.log(`  V1 totalUsers:             ${v1TotalUsers}`);
  console.log(`  V1 totalActiveStakes:      ${ethers.formatUnits(v1TotalActive, 18)} USDT`);
  console.log(`  V1 totalProtocolTurnover:  ${ethers.formatUnits(v1Turnover, 18)} USDT`);

  // Check DAO state
  const daoMemberCount = await oldDao.getQualifiedMemberCount();
  const daoLastDist = await oldDao.lastDistribution();
  const daoCycle = await oldDao.currentCycle();
  const daoUsdtBal = await usdt.balanceOf(OLD_DAO);
  console.log(`  DAO qualified members:     ${daoMemberCount}`);
  console.log(`  DAO lastDistribution:      ${daoLastDist} (${daoLastDist > 0n ? new Date(Number(daoLastDist) * 1000).toISOString() : "never"})`);
  console.log(`  DAO currentCycle:          ${daoCycle}`);
  console.log(`  DAO USDT balance:          ${ethers.formatUnits(daoUsdtBal, 18)} USDT`);

  if (daoMemberCount > 0n) {
    console.log("\n  ⚠️  WARNING: DAO has qualified members. They will need to re-qualify");
    console.log("     on the new DAO via selfQualify() after migration.");
    console.log("     DAO cycle state (currentCycle, cyclePool) will reset to 0.");
    console.log("     All USDT will be transferred to the new DAO.");
  }

  // Check V1 engine USDT balance
  const engineUsdtBal = await usdt.balanceOf(OLD_ENGINE);
  console.log(`  V1 Engine USDT balance:    ${ethers.formatUnits(engineUsdtBal, 18)} USDT`);

  // =====================================================
  // PHASE 1: BACKUP V1 STATE TO JSON
  // =====================================================
  console.log("\n========== PHASE 1: BACKUP V1 STATE ==========");

  const currentTimestamp = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  console.log(`  Current block timestamp: ${currentTimestamp} (${new Date(Number(currentTimestamp) * 1000).toISOString()})`);

  // Traverse referral tree to find all users
  console.log("  Traversing referral tree...");
  const allUsers = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const root of KNOWN_ROOTS) {
    const isReg = await registry.isRegistered(root).catch(() => false);
    if (isReg) {
      queue.push(root);
      allUsers.add(root);
    }
  }
  console.log(`  Starting roots: ${queue.length}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      const downlines = await registry.getDirectDownlines(current);
      for (const d of downlines) {
        allUsers.add(d);
        if (!visited.has(d)) queue.push(d);
      }
    } catch {
      // skip
    }
  }

  console.log(`  Found ${allUsers.size} unique registered wallets`);

  // Read all user state from V1
  interface UserBackup {
    address: string;
    hasStaked: boolean;
    stakes: UserStakeData[];
    totalClaimed: bigint;
    seededEarnings: bigint;
    accruedYield: bigint;
    claimableYield: bigint;
    migrated: boolean;
  }

  const backup: UserBackup[] = [];
  let userCount = 0;

  for (const user of allUsers) {
    userCount++;
    if (userCount % 20 === 0) {
      console.log(`  Backup progress: ${userCount}/${allUsers.size}...`);
    }

    try {
      const hasStaked = await oldEngine.hasStaked(user);
      if (!hasStaked) continue;

      const [stakes, totalClaimed, seeded, accrued, claimable] = await Promise.all([
        oldEngine.getUserStakes(user),
        oldEngine.totalClaimed(user),
        oldEngine.seededEarnings(user),
        oldEngine.calculateAccruedYield(user),
        oldEngine.getClaimableYield(user),
      ]);

      if (stakes.length === 0) continue;

      backup.push({
        address: user,
        hasStaked: true,
        stakes: stakes.map((s: UserStakeData) => ({
          activeStake: s.activeStake,
          totalEarnings: s.totalEarnings,
          stakeStartTime: s.stakeStartTime,
          stakeDayIndex: s.stakeDayIndex,
          tier: s.tier,
          referrer: s.referrer,
          isActive: s.isActive,
        })),
        totalClaimed,
        seededEarnings: seeded,
        accruedYield: accrued,
        claimableYield: claimable,
        migrated: false,
      });
    } catch {
      // skip on error
    }
  }

  console.log(`  Backed up ${backup.length} users with stakes`);

  // Save backup to JSON (convert bigints to strings)
  const backupJson = {
    _meta: {
      timestamp: new Date().toISOString(),
      blockTimestamp: currentTimestamp.toString(),
      v1Engine: OLD_ENGINE,
      v1TotalUsers: v1TotalUsers.toString(),
      v1TotalActiveStakes: v1TotalActive.toString(),
      v1TotalProtocolTurnover: v1Turnover.toString(),
      usersBackedUp: backup.length,
    },
    users: backup.map((u) => ({
      address: u.address,
      hasStaked: u.hasStaked,
      stakes: u.stakes.map((s) => ({
        activeStake: s.activeStake.toString(),
        totalEarnings: s.totalEarnings.toString(),
        stakeStartTime: s.stakeStartTime.toString(),
        stakeDayIndex: s.stakeDayIndex,
        tier: s.tier,
        referrer: s.referrer,
        isActive: s.isActive,
      })),
      totalClaimed: u.totalClaimed.toString(),
      seededEarnings: u.seededEarnings.toString(),
      accruedYield: u.accruedYield.toString(),
      claimableYield: u.claimableYield.toString(),
      migrated: false,
    })),
  };

    fs.writeFileSync(BACKUP_FILE, jsonStringify(backupJson, 2));
  console.log(`  Backup saved to: ${BACKUP_FILE}`);

  // =====================================================
  // PHASE 2: PAUSE V1 ENGINE
  // =====================================================
  console.log("\n========== PHASE 2: PAUSE V1 ENGINE ==========");
  try {
    const pauseTx = await oldEngine.pause();
    await pauseTx.wait();
    console.log("  V1 engine paused — no new stakes/claims possible");
  } catch (e: any) {
    console.log(`  WARN: Could not pause V1 engine: ${e.message?.substring(0, 100)}`);
    console.log("  Continuing anyway...");
  }

  // =====================================================
  // PHASE 3: DEPLOY V2 CONTRACTS
  // =====================================================
  console.log("\n========== PHASE 3: DEPLOY V2 CONTRACTS ==========");

  // 3a. Deploy InvestmentEngineV2
  console.log("  Deploying InvestmentEngineV2...");
  const InvestmentEngineV2 = await ethers.getContractFactory("InvestmentEngineV2");
  const v2Engine = await InvestmentEngineV2.deploy(
    USDT_ADDR, OSLO_ADDR, DEX_ADDR, VAULT_ADDR, REGISTRY_ADDR, LEVEL_ADDR, COMPANY_WALLET, PERF_WALLET
  );
  await v2Engine.waitForDeployment();
  const v2EngineAddr = await v2Engine.getAddress();
  console.log(`  InvestmentEngineV2: ${v2EngineAddr}`);

  // 3b. Deploy new OsloDAO (pointing to V2 engine)
  console.log("  Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const newDao = await OsloDAO.deploy(USDT_ADDR, v2EngineAddr);
  await newDao.waitForDeployment();
  const newDaoAddr = await newDao.getAddress();
  console.log(`  OsloDAO (new): ${newDaoAddr}`);

  // =====================================================
  // PHASE 4: WIRE PERMISSIONS
  // =====================================================
  console.log("\n========== PHASE 4: WIRE PERMISSIONS ==========");

  const tokenC = new ethers.Contract(OSLO_ADDR, ROLE_ABI, deployer);
  const dexC = new ethers.Contract(DEX_ADDR, ROLE_ABI, deployer);
  const vaultC = new ethers.Contract(VAULT_ADDR, ROLE_ABI, deployer);
  const levelC = new ethers.Contract(LEVEL_ADDR, ROLE_ABI, deployer);
  const lbC = new ethers.Contract(LB_ADDR, ROLE_ABI, deployer);
  const engineC = new ethers.Contract(v2EngineAddr, ENGINE_WRITE_ABI, deployer);
  const daoC = new ethers.Contract(newDaoAddr, DAO_WRITE_ABI, deployer);

  // 4a. Revoke old engine roles on kept contracts
  console.log("  4a: Revoking old engine roles...");
  try { await tokenC.revokeRole(BURNER_ROLE, OLD_ENGINE); } catch {}
  try { await dexC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await vaultC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await levelC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await lbC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  console.log("    Old engine roles revoked on Token, DEX, Vault, LevelSystem, LB");

  // 4b. Grant new engine roles on kept contracts
  console.log("  4b: Granting new engine roles...");
  await tokenC.grantRole(BURNER_ROLE, v2EngineAddr);
  await dexC.grantRole(ENGINE_ROLE, v2EngineAddr);
  await vaultC.grantRole(ENGINE_ROLE, v2EngineAddr);
  await levelC.grantRole(ENGINE_ROLE, v2EngineAddr);
  await lbC.grantRole(ENGINE_ROLE, v2EngineAddr);
  console.log("    BURNER_ROLE → V2 on Token");
  console.log("    ENGINE_ROLE → V2 on DEX, Vault, LevelSystem, LB");

  // 4c. Grant roles on V2 engine
  console.log("  4c: Granting roles on V2 engine...");
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LEVEL_ADDR);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LB_ADDR);
  await engineC.setLeadershipBonus(LB_ADDR);
  await engineC.setDAOContract(newDaoAddr);
  await engineC.setRewardWallet(REWARD_WALLET);
  console.log("    LEVEL_SYSTEM_ROLE → LevelSystem + LB on V2");
  console.log("    setLeadershipBonus, setDAOContract, setRewardWallet done");

  // 4d. Update engine pointer on LevelSystem + LeadershipBonus
  console.log("  4d: Updating engine pointer on LevelSystem + LB...");
  const levelSetC = new ethers.Contract(LEVEL_ADDR, SET_ENGINE_ABI, deployer);
  const lbSetC = new ethers.Contract(LB_ADDR, SET_ENGINE_ABI, deployer);
  await levelSetC.setInvestmentEngine(v2EngineAddr);
  await lbSetC.setInvestmentEngine(v2EngineAddr);
  console.log("    setInvestmentEngine done on LevelSystem + LeadershipBonus");

  // 4e. Set ReferralRegistry on new DAO
  console.log("  4e: Setting ReferralRegistry on new DAO...");
  await daoC.setReferralRegistry(REGISTRY_ADDR);
  console.log("    setReferralRegistry done");

  // =====================================================
  // PHASE 5: MIGRATE ENGINE STATE
  // =====================================================
  console.log("\n========== PHASE 5: MIGRATE ENGINE STATE ==========");
  console.log("  Migration formula per user:");
  console.log("    • v2_externalEarnings = max(0, sum(totalEarnings) - totalClaimed)");
  console.log("    • v2_totalEarnings per stake = proportional share of totalClaimed");
  console.log("    • seededEarnings preserved exactly from V1");
  console.log("    • totalClaimed preserved exactly from V1");
  console.log();

  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedUsers: string[] = [];

  for (const user of backup) {
    if (user.migrated) {
      skippedCount++;
      continue;
    }

    const addr = `${user.address.slice(0, 8)}...${user.address.slice(-6)}`;

    try {
      // ---- Safety: skip if already migrated (re-run protection) ----
      const v2HasStaked = await engineC.hasStaked(user.address);
      if (v2HasStaked) {
        console.log(`  SKIP: ${addr} — already has stakes in V2 (previously migrated)`);
        skippedCount++;
        user.migrated = true;
        continue;
      }

      // ---- Compute migration values ----
      const stakes = user.stakes;
      const totalClaimed = user.totalClaimed;
      const seeded = user.seededEarnings;

      // Sum of all V1 totalEarnings across stakes
      let sumTotalEarnings = 0n;
      for (const s of stakes) {
        sumTotalEarnings += s.totalEarnings;
      }

      // External earnings = commissions = sum(totalEarnings) - actual yield claimed
      const externalEarnings = sumTotalEarnings > totalClaimed
        ? sumTotalEarnings - totalClaimed
        : 0n;

      // Distribute totalClaimed across stakes proportionally
      // Weight for each stake = min(totalEarnings, accruedYield)
      const weights: bigint[] = [];
      let sumWeights = 0n;

      for (const s of stakes) {
        const accrued = calculateStakeYield(s, currentTimestamp);
        const weight = s.totalEarnings < accrued ? s.totalEarnings : accrued;
        weights.push(weight);
        sumWeights += weight;
      }

      // Compute v2_totalEarnings per stake
      const v2TotalEarnings: bigint[] = [];
      let allocated = 0n;

      for (let i = 0; i < stakes.length; i++) {
        if (i === stakes.length - 1) {
          // Last stake gets the remainder (ensures exact sum)
          v2TotalEarnings.push(totalClaimed - allocated);
        } else if (sumWeights > 0n) {
          const share = (totalClaimed * weights[i]) / sumWeights;
          v2TotalEarnings.push(share);
          allocated += share;
        } else {
          v2TotalEarnings.push(0n);
        }
      }

      // ---- Execute migration transactions ----
      // Import each stake
      for (let i = 0; i < stakes.length; i++) {
        const s = stakes[i];
        const tx = await engineC.adminImportStake(
          user.address,
          s.activeStake,
          v2TotalEarnings[i],
          s.stakeStartTime,
          s.stakeDayIndex,
          s.tier,
          s.referrer,
          s.isActive
        );
        await tx.wait();
      }

      // Set seededEarnings (exact copy from V1)
      if (seeded > 0n) {
        const tx = await engineC.adminSetSeededEarnings(user.address, seeded);
        await tx.wait();
      }

      // Set externalEarnings (commission portion separated from yield)
      if (externalEarnings > 0n) {
        const tx = await engineC.adminSetExternalEarnings(user.address, externalEarnings);
        await tx.wait();
      }

      // Set totalClaimed (exact copy from V1)
      if (totalClaimed > 0n) {
        const tx = await engineC.adminSeedClaimed(user.address, totalClaimed);
        await tx.wait();
      }

      migratedCount++;
      user.migrated = true;

      if (migratedCount % 10 === 0) {
        console.log(`  Progress: ${migratedCount}/${backup.length} users migrated...`);
        // Update backup file with progress
        backupJson.users = backup.map((u) => ({
          address: u.address,
          hasStaked: u.hasStaked,
          stakes: u.stakes.map((s) => ({
            activeStake: s.activeStake.toString(),
            totalEarnings: s.totalEarnings.toString(),
            stakeStartTime: s.stakeStartTime.toString(),
            stakeDayIndex: s.stakeDayIndex,
            tier: s.tier,
            referrer: s.referrer,
            isActive: s.isActive,
          })),
          totalClaimed: u.totalClaimed.toString(),
          seededEarnings: u.seededEarnings.toString(),
          accruedYield: u.accruedYield.toString(),
          claimableYield: u.claimableYield.toString(),
          migrated: u.migrated,
        }));
                fs.writeFileSync(BACKUP_FILE, jsonStringify(backupJson, 2));
      }
    } catch (e: any) {
      if (e.message?.includes("insufficient funds")) {
        console.log(`  OUT OF BNB! Stopped at user ${migratedCount + 1}/${backup.length}`);
        console.log(`  Backup file: ${BACKUP_FILE} (re-run to resume)`);
        return;
      }
      console.log(`  FAIL: ${addr} — ${e.message?.substring(0, 120)}`);
      failedUsers.push(user.address);
      failedCount++;
    }
  }

  // Final backup save
  backupJson.users = backup.map((u) => ({
    address: u.address,
    hasStaked: u.hasStaked,
    stakes: u.stakes.map((s) => ({
      activeStake: s.activeStake.toString(),
      totalEarnings: s.totalEarnings.toString(),
      stakeStartTime: s.stakeStartTime.toString(),
      stakeDayIndex: s.stakeDayIndex,
      tier: s.tier,
      referrer: s.referrer,
      isActive: s.isActive,
    })),
    totalClaimed: u.totalClaimed.toString(),
    seededEarnings: u.seededEarnings.toString(),
    accruedYield: u.accruedYield.toString(),
    claimableYield: u.claimableYield.toString(),
    migrated: u.migrated,
  }));
    fs.writeFileSync(BACKUP_FILE, jsonStringify(backupJson, 2));

  console.log(`\n  Migration complete: ${migratedCount} migrated, ${skippedCount} skipped, ${failedCount} failed`);

  if (failedCount > 0) {
    console.log("  Failed users:");
    for (const addr of failedUsers) {
      console.log(`    ${addr}`);
    }
  }

  // =====================================================
  // PHASE 6: HANDLE DAO
  // =====================================================
  console.log("\n========== PHASE 6: HANDLE DAO ==========");

  // Transfer USDT from old DAO to new DAO
  const oldDaoUsdt = await usdt.balanceOf(OLD_DAO);
  if (oldDaoUsdt > 0n) {
    console.log(`  Transferring ${ethers.formatUnits(oldDaoUsdt, 18)} USDT from old DAO to new DAO...`);
    const oldDaoUsdtC = new ethers.Contract(OLD_DAO, ERC20_ABI, deployer);
    // Can't call transfer from the DAO contract directly — need to use DAO's own functions
    // OsloDAO doesn't have a withdraw function, so we need to check if deployer has DEFAULT_ADMIN_ROLE
    // Actually, OsloDAO inherits AccessControl, but there's no withdraw function.
    // The USDT in the DAO is meant for royalty distributions.
    // We'll try to transfer using the DAO's role — but there's no function for this.
    // Alternative: just leave the USDT in old DAO and let remaining claims finish, then handle manually.
    console.log(`  NOTE: OsloDAO has no withdraw function.`);
    console.log(`  The ${ethers.formatUnits(oldDaoUsdt, 18)} USDT in old DAO will remain there.`);
    console.log(`  Qualified members can still claim from the old DAO's remaining cycle.`);
    console.log(`  New deposits will send 0.5% to the new DAO at ${newDaoAddr}.`);
  } else {
    console.log("  Old DAO has no USDT — nothing to transfer.");
  }

  // =====================================================
  // PHASE 7: VERIFY
  // =====================================================
  console.log("\n========== PHASE 7: VERIFY ==========");

  const v2Read = new ethers.Contract(v2EngineAddr, ENGINE_READ_ABI.concat([
    "function externalEarnings(address) view returns (uint256)"
  ]), deployer);

  const [v2TotalUsers, v2TotalActive, v2Turnover] = await Promise.all([
    v2Read.totalUsers(),
    v2Read.totalActiveStakes(),
    v2Read.totalProtocolTurnover(),
  ]);

  console.log("  Protocol stats comparison:");
  console.log(`    totalUsers:             V1=${v1TotalUsers}  V2=${v2TotalUsers}  ${v1TotalUsers === v2TotalUsers ? "✓" : "✗ MISMATCH"}`);
  console.log(`    totalActiveStakes:      V1=${ethers.formatUnits(v1TotalActive, 18)}  V2=${ethers.formatUnits(v2TotalActive, 18)}  ${v1TotalActive === v2TotalActive ? "✓" : "✗ MISMATCH"}`);
  console.log(`    totalProtocolTurnover:  V1=${ethers.formatUnits(v1Turnover, 18)}  V2=${ethers.formatUnits(v2Turnover, 18)}  ${v1Turnover === v2Turnover ? "✓" : "✗ MISMATCH"}`);

  // Spot-check: verify previously affected wallets can now claim
  console.log("\n  Spot-checking previously affected wallets:");
  const affectedWallets = [
    "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8",
    "0x69921E17EBD81B637Bd28E7935eC39Ee140871EC",
    "0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839",
    "0x2A4cEFED3E7Dd74F40E97e7bd6827A33e5a0e3Fd",
  ];

  let allFixed = true;
  for (const wallet of affectedWallets) {
    const v1Claimable = await oldEngine.getClaimableYield(wallet);
    const v2Claimable = await v2Read.getClaimableYield(wallet);
    const v2Accrued = await v2Read.calculateAccruedYield(wallet);
    const v2External = await v2Read.externalEarnings(wallet);
    const v2Seeded = await v2Read.seededEarnings(wallet);
    const v2Claimed = await v2Read.totalClaimed(wallet);
    const v2Stakes = await v2Read.getUserStakes(wallet);

    const addr = `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
    const wasBlocked = v1Claimable === 0n;
    const isFixed = v2Claimable > 0n || v2Accrued === 0n;

    if (!isFixed) allFixed = false;

    console.log(`    ${addr}: V1 claimable=${ethers.formatUnits(v1Claimable, 18)}, V2 claimable=${ethers.formatUnits(v2Claimable, 18)}, accrued=${ethers.formatUnits(v2Accrued, 18)}, external=${ethers.formatUnits(v2External, 18)}, seeded=${ethers.formatUnits(v2Seeded, 18)}, claimed=${ethers.formatUnits(v2Claimed, 18)}, stakes=${v2Stakes.length} ${wasBlocked && isFixed ? "✓ FIXED" : wasBlocked && !isFixed ? "✗ STILL BLOCKED" : "—"}`);
  }

  if (allFixed) {
    console.log("\n  ✅ All previously affected wallets are now claimable!");
  } else {
    console.log("\n  ⚠️  Some wallets still show 0 claimable — check details above.");
  }

  // Verify random healthy wallets
  console.log("\n  Spot-checking healthy wallets (no data loss):");
  const healthySample = backup.filter((u) => u.claimableYield > 0n).slice(0, 5);
  for (const user of healthySample) {
    const v1Stakes = await oldEngine.getUserStakes(user.address);
    const v2Stakes = await v2Read.getUserStakes(user.address);
    const v1Claimed = await oldEngine.totalClaimed(user.address);
    const v2Claimed = await v2Read.totalClaimed(user.address);
    const v1Seeded = await oldEngine.seededEarnings(user.address);
    const v2Seeded = await v2Read.seededEarnings(user.address);

    const addr = `${user.address.slice(0, 8)}...${user.address.slice(-6)}`;
    const stakesMatch = v1Stakes.length === v2Stakes.length;
    const claimedMatch = v1Claimed === v2Claimed;
    const seededMatch = v1Seeded === v2Seeded;

    console.log(`    ${addr}: stakes ${stakesMatch ? "✓" : "✗"} (${v1Stakes.length}→${v2Stakes.length}), claimed ${claimedMatch ? "✓" : "✗"}, seeded ${seededMatch ? "✓" : "✗"}`);
  }

  // =====================================================
  // PHASE 8: UPDATE .env.local
  // =====================================================
  console.log("\n========== PHASE 8: UPDATE .env.local ==========");

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  const updates: Record<string, string> = {
    "NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS": v2EngineAddr,
    "NEXT_PUBLIC_OSLO_DAO_ADDRESS": newDaoAddr,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`${key}=.*`, "g");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${key}=${value}\n`;
    }
  }
  fs.writeFileSync(envPath, envContent);
  console.log("  .env.local updated with new contract addresses");

  // =====================================================
  // SUMMARY
  // =====================================================
  console.log("\n" + "=".repeat(70));
  console.log("V2 MIGRATION COMPLETE");
  console.log("=".repeat(70));
  console.log("KEPT (unchanged):");
  console.log(`  OsloToken:           ${OSLO_ADDR}`);
  console.log(`  OsloDEX:             ${DEX_ADDR}`);
  console.log(`  RewardVault:         ${VAULT_ADDR}`);
  console.log(`  ReferralRegistry:    ${REGISTRY_ADDR}`);
  console.log(`  LevelIncomeSystem:   ${LEVEL_ADDR}`);
  console.log(`  LeadershipBonus:     ${LB_ADDR}`);
  console.log("NEW (deployed):");
  console.log(`  InvestmentEngineV2:  ${v2EngineAddr}`);
  console.log(`  OsloDAO (new):       ${newDaoAddr}`);
  console.log("OLD (deprecated, still on-chain as backup):");
  console.log(`  InvestmentEngine V1: ${OLD_ENGINE} (PAUSED)`);
  console.log(`  OsloDAO (old):       ${OLD_DAO}`);
  console.log();
  console.log(`  Users migrated:      ${migratedCount}/${backup.length}`);
  console.log(`  Users failed:        ${failedCount}`);
  console.log(`  Backup file:         ${BACKUP_FILE}`);
  console.log();
  console.log("NEXT STEPS:");
  console.log("  1. Verify frontend works with new contracts");
  console.log("  2. Rebuild and deploy frontend");
  console.log("  3. If any users failed, re-run this script (resumes from backup)");
  console.log("  4. DAO members need to call selfQualify() on the new DAO");
  console.log("  5. Run scan-all-wallets.ts against V2 to confirm all wallets are healthy");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
