/**
 * seed-mainnet-snapshot.ts
 * Seeds mainnet snapshot data into freshly deployed testnet contracts.
 * 
 * Prerequisites:
 *   - Contracts deployed via deploy-testnet.ts (addresses in testnet-addresses.json)
 *   - Contracts must NOT have setupComplete = true (admin still active)
 *   - Deployer is the admin with migration privileges
 * 
 * Run: npx hardhat run scripts/seed-mainnet-snapshot.ts --network bscTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotUser {
  address: string;
  referrer: string;
  unlockedLevels: number;
  directReferralCount: number;
  totalEarned: string;
  referralRewards: string;
  teamSize: number;
  qualifiedDirects: number;
  levelIncome: string[];
}

interface SnapshotInvestment {
  address: string;
  totalActiveDeposit: string;
  depositCount: number;
  totalCombinedEarnings: string;
  tier: number;
  usdtBalance: string;
  osloBalance: string;
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
  pendingRewards: string;
}

interface Snapshot {
  meta: any;
  protocolGlobals: any;
  contractBalances: any;
  users: SnapshotUser[];
  userInvestments: SnapshotInvestment[];
  deposits: SnapshotDeposit[];
  rankData: any[];
  daoData: any;
  summary: any;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BATCH_SIZE_USERS = 15;
const BATCH_SIZE_DEPOSITS = 10;
const BATCH_SIZE_EARNINGS = 20;

function toWei(value: string): bigint {
  // Parse decimal string to 18-decimal wei
  const parts = value.split(".");
  const whole = parts[0] || "0";
  let frac = parts[1] || "0";
  frac = frac.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * BigInt(10n ** 18n) + BigInt(frac);
}

/**
 * Topological sort: parents must come before children in referral tree.
 * Users with referrer = 0x000... are roots and go first.
 */
function topologicalSort(users: SnapshotUser[]): SnapshotUser[] {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const addressMap = new Map<string, SnapshotUser>();
  const childrenMap = new Map<string, SnapshotUser[]>();

  for (const u of users) {
    addressMap.set(u.address.toLowerCase(), u);
    const parent = u.referrer.toLowerCase();
    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent)!.push(u);
  }

  const sorted: SnapshotUser[] = [];
  const visited = new Set<string>();

  function visit(addr: string) {
    if (visited.has(addr)) return;
    visited.add(addr);
    const children = childrenMap.get(addr) || [];
    // First add this node (if it's a real user)
    const user = addressMap.get(addr);
    if (user) sorted.push(user);
    // Then visit children
    for (const child of children) {
      visit(child.address.toLowerCase());
    }
  }

  // Start from roots (referrer = 0x000...)
  const roots = users.filter(u => u.referrer.toLowerCase() === ZERO);
  for (const root of roots) {
    visit(root.address.toLowerCase());
  }

  // If any users were missed (circular ref edge case), add them at end
  for (const u of users) {
    if (!visited.has(u.address.toLowerCase())) {
      sorted.push(u);
    }
  }

  return sorted;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🌱 Seeding mainnet snapshot into testnet contracts`);
  console.log(`   Deployer: ${deployer.address}`);

  // Load addresses and snapshot
  const addrPath = path.join(__dirname, "../data/testnet-addresses.json");
  const snapshotPath = path.join(__dirname, "../data/mainnet-snapshot.json");

  const addresses = JSON.parse(fs.readFileSync(addrPath, "utf-8"));
  const snapshot: Snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

  console.log(`   Snapshot: ${snapshot.summary.totalUsers} users, ${snapshot.summary.totalDeposits} deposits (${snapshot.summary.activeDeposits} active)`);

  // Connect to contracts
  const referral = await ethers.getContractAt("OSLOReferral", addresses.OSLOReferral);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", addresses.OSLOInvestmentEngine);

  // ─── Step 1: Migrate Users ─────────────────────────────────────────────────

  console.log(`\n📋 Step 1: Migrating referral tree (${snapshot.users.length} users)...`);

  const sortedUsers = topologicalSort(snapshot.users);
  const totalRegBefore = Number(await referral.totalRegistered());
  console.log(`   On-chain registered: ${totalRegBefore}/${snapshot.users.length}`);

  if (totalRegBefore >= snapshot.users.length) {
    console.log(`   ✓ Already complete, skipping.`);
  } else {
    // Skip deployer (already registered as root)
    const usersToMigrate = sortedUsers.filter(
      u => u.address.toLowerCase() !== deployer.address.toLowerCase()
    );

    // Filter out already-registered users by checking on-chain
    const unregistered: typeof usersToMigrate = [];
    for (const u of usersToMigrate) {
      const info = await referral.userInfo(u.address);
      if (!info.registered) unregistered.push(u);
    }

    console.log(`   Migrating ${unregistered.length} unregistered users...`);

    for (let i = 0; i < unregistered.length; i += BATCH_SIZE_USERS) {
      const batch = unregistered.slice(i, i + BATCH_SIZE_USERS);
      const addrs = batch.map(u => u.address);
      const referrers = batch.map(u => u.referrer);
      const levels = batch.map(u => u.unlockedLevels);

      const tx = await referral.migrateUsers(addrs, referrers, levels);
      await tx.wait();
      console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE_USERS) + 1}: ${batch.length} users (tx: ${tx.hash.slice(0, 10)}...)`);
    }
  }

  const totalReg = await referral.totalRegistered();
  console.log(`   Total registered on-chain: ${totalReg}`);

  // ─── Step 2: Migrate Referral Earnings ─────────────────────────────────────

  console.log(`\n💰 Step 2: Migrating referral earnings...`);

  // Filter users who have non-zero totalEarned or referralRewards
  const usersWithEarnings = snapshot.users.filter(
    u => parseFloat(u.totalEarned) > 0 || parseFloat(u.referralRewards) > 0
  );

  if (usersWithEarnings.length > 0) {
    for (let i = 0; i < usersWithEarnings.length; i += BATCH_SIZE_EARNINGS) {
      const batch = usersWithEarnings.slice(i, i + BATCH_SIZE_EARNINGS);
      const addrs = batch.map(u => u.address);
      const totalEarned = batch.map(u => toWei(u.totalEarned));
      const rewards = batch.map(u => toWei(u.referralRewards));

      const tx = await referral.migrateEarnings(addrs, totalEarned, rewards);
      await tx.wait();
      console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE_EARNINGS) + 1}: ${batch.length} users with earnings`);
    }
  } else {
    console.log(`   No users with non-zero earnings to migrate.`);
  }

  // ─── Step 3: Migrate Active Deposits ───────────────────────────────────────

  console.log(`\n📦 Step 3: Migrating active deposits...`);

  const activeDeposits = snapshot.deposits.filter(d => d.active);
  console.log(`   Active deposits to migrate: ${activeDeposits.length}`);

  // Check how many deposits already exist on-chain (resume support)
  // Count total on-chain deposits across all users in snapshot
  let totalOnChainDeposits = 0;
  const depositCountCache = new Map<string, number>();
  for (const inv of snapshot.userInvestments) {
    if (parseFloat(inv.totalActiveDeposit) > 0 || inv.depositCount > 0) {
      const count = Number(await ie.getDepositCount(inv.address));
      depositCountCache.set(inv.address.toLowerCase(), count);
      totalOnChainDeposits += count;
    }
  }

  console.log(`   Already on-chain: ${totalOnChainDeposits} deposits`);

  // Skip deposits that are already migrated
  const depositsToMigrate = activeDeposits.slice(totalOnChainDeposits);
  console.log(`   Remaining to migrate: ${depositsToMigrate.length}`);

  for (let i = 0; i < depositsToMigrate.length; i += BATCH_SIZE_DEPOSITS) {
    const batch = depositsToMigrate.slice(i, i + BATCH_SIZE_DEPOSITS);
    const entries = batch.map(d => ({
      owner: d.owner,
      amount: toWei(d.amount),
      tier: d.tier,
      dailyRate: d.dailyRate,
      depositTime: d.depositTime,
      lastClaimTime: d.lastClaimTime,
      totalClaimed: toWei(d.totalClaimed),
      maxReturn: toWei(d.maxReturn),
    }));

    const tx = await ie.migrateDeposits(entries);
    await tx.wait();
    console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE_DEPOSITS) + 1}: ${batch.length} deposits (tx: ${tx.hash.slice(0, 10)}...)`);
  }

  const totalDep = await ie.totalDeposited();
  console.log(`   Total deposited on-chain: ${ethers.formatEther(totalDep)} USDT`);

  // ─── Step 4: Migrate Combined Earnings ─────────────────────────────────────

  console.log(`\n📊 Step 4: Migrating combined earnings (3X cap tracking)...`);

  const usersWithCombined = snapshot.userInvestments.filter(
    u => parseFloat(u.totalCombinedEarnings) > 0
  );

  if (usersWithCombined.length > 0) {
    for (let i = 0; i < usersWithCombined.length; i += BATCH_SIZE_EARNINGS) {
      const batch = usersWithCombined.slice(i, i + BATCH_SIZE_EARNINGS);
      const addrs = batch.map(u => u.address);
      const amounts = batch.map(u => toWei(u.totalCombinedEarnings));

      const tx = await ie.migrateCombinedEarnings(addrs, amounts);
      await tx.wait();
      console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE_EARNINGS) + 1}: ${batch.length} users`);
    }
  } else {
    console.log(`   No users with combined earnings to migrate.`);
  }

  // ─── Step 5: Summary ───────────────────────────────────────────────────────

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`✅ Seeding Complete!`);
  console.log(`   Users migrated: ${Number(totalReg) - 1}`);
  console.log(`   Active deposits migrated: ${activeDeposits.length}`);
  console.log(`   Users with referral earnings: ${usersWithEarnings.length}`);
  console.log(`   Users with combined earnings: ${usersWithCombined.length}`);
  console.log(`═══════════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exitCode = 1;
});
