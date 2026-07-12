import { ethers } from "hardhat";

/**
 * Migrate users from V2 (paused) to V2.1 (already deployed + wired).
 * Uses corrected formula: totalEarnings = min(totalEarnings, accruedYield)
 *
 * Usage: npx hardhat run scripts/deploy/migrate-v2-fix-run.ts --network bscMainnet
 */

const SOURCE_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0"; // V2 (paused, has data)
const TARGET_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80"; // V2.1 (empty, wired)
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const KNOWN_ROOTS = [
  "0xb259fcC202b17C124201C872c52f108ade380B4F",
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4",
  "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56",
  "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4",
];

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function getDirectDownlines(address) view returns (address[])",
];

const TIER1_RATES = [100, 75, 95, 65, 100, 85, 55];
const TIER2_RATES = [115, 100, 115, 110, 105, 100, 125];
const ONE_DAY = 86400n;

function calcYield(s: { isActive: boolean; stakeStartTime: bigint; stakeDayIndex: number; tier: number; activeStake: bigint }, ts: bigint): bigint {
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
    y += ((s.activeStake * BigInt(rates[idx])) / 10000n * rem) / ONE_DAY;
  }
  return y;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("V2 → V2.1 User Migration (corrected formula)");
  console.log(`Source: ${SOURCE_ENGINE}`);
  console.log(`Target: ${TARGET_ENGINE}`);
  console.log(`BNB: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const src = new ethers.Contract(SOURCE_ENGINE, ENGINE_ABI, deployer);
  const tgt = new ethers.Contract(TARGET_ENGINE, ENGINE_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);

  // Traverse referral tree
  const allUsers = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const root of KNOWN_ROOTS) {
    if (await registry.isRegistered(root).catch(() => false)) { queue.push(root); allUsers.add(root); }
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

  const ts = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  let migrated = 0, skipped = 0, failed = 0;

  for (const user of allUsers) {
    try {
      const hasStaked = await src.hasStaked(user);
      if (!hasStaked) continue;

      // Skip if already in target
      const tgtHas = await tgt.hasStaked(user);
      if (tgtHas) { skipped++; continue; }

      const [stakes, claimed, seeded, external] = await Promise.all([
        src.getUserStakes(user),
        src.totalClaimed(user),
        src.seededEarnings(user),
        src.externalEarnings(user),
      ]);
      if (stakes.length === 0) continue;

      // Explicit BigInt conversion
      const sClaimed = BigInt(claimed);
      const sSeeded = BigInt(seeded);
      const sExternal = BigInt(external);

      // Calculate corrected totalEarnings per stake
      let totalExcess = 0n;
      const correctedTEs: bigint[] = [];

      for (const rawStake of stakes) {
        const s = {
          activeStake: BigInt(rawStake.activeStake),
          totalEarnings: BigInt(rawStake.totalEarnings),
          stakeStartTime: BigInt(rawStake.stakeStartTime),
          stakeDayIndex: Number(rawStake.stakeDayIndex),
          tier: Number(rawStake.tier),
          referrer: String(rawStake.referrer),
          isActive: Boolean(rawStake.isActive),
        };

        const accrued = calcYield(s, ts);
        const corrected = s.totalEarnings < accrued ? s.totalEarnings : accrued;
        const excess = s.totalEarnings - corrected;
        correctedTEs.push(corrected);
        totalExcess += excess;
      }

      // Import each stake
      for (let i = 0; i < stakes.length; i++) {
        const raw = stakes[i];
        const s = {
          activeStake: BigInt(raw.activeStake),
          stakeStartTime: BigInt(raw.stakeStartTime),
          stakeDayIndex: Number(raw.stakeDayIndex),
          tier: Number(raw.tier),
          referrer: String(raw.referrer),
          isActive: Boolean(raw.isActive),
        };
        const tx = await tgt.adminImportStake(
          user, s.activeStake, correctedTEs[i], s.stakeStartTime,
          s.stakeDayIndex, s.tier, s.referrer, s.isActive
        );
        await tx.wait();
      }

      // Set seededEarnings (original + excess)
      const newSeeded = sSeeded + totalExcess;
      if (newSeeded > 0n) {
        await (await tgt.adminSetSeededEarnings(user, newSeeded)).wait();
      }

      // Set externalEarnings
      if (sExternal > 0n) {
        await (await tgt.adminSetExternalEarnings(user, sExternal)).wait();
      }

      // Set totalClaimed
      if (sClaimed > 0n) {
        await (await tgt.adminSeedClaimed(user, sClaimed)).wait();
      }

      migrated++;
      if (migrated % 10 === 0) console.log(`  Progress: ${migrated} migrated...`);
    } catch (e: any) {
      if (e.message?.includes("insufficient funds")) {
        console.log(`  OUT OF BNB! Stopped at ${migrated + 1}`);
        break;
      }
      console.log(`  FAIL: ${user.slice(0, 10)}... — ${e.message?.substring(0, 80)}`);
      failed++;
    }
  }

  console.log(`\nMigrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`);

  // Verify
  const [tUsers, tActive, tTurnover] = await Promise.all([
    tgt.totalUsers(), tgt.totalActiveStakes(), tgt.totalProtocolTurnover(),
  ]);
  console.log(`\nV2.1 stats: ${tUsers} users, ${ethers.formatUnits(tActive, 18)} active, ${ethers.formatUnits(tTurnover, 18)} turnover`);

  // Check for blocked wallets
  let blocked = 0;
  for (const user of allUsers) {
    try {
      const hasStaked = await tgt.hasStaked(user);
      if (!hasStaked) continue;
      const [claimable, accrued] = await Promise.all([
        tgt.getClaimableYield(user),
        tgt.calculateAccruedYield(user),
      ]);
      if (claimable === 0n && accrued > 0n) blocked++;
    } catch {}
  }
  console.log(`Blocked wallets (claimable=0, accrued>0): ${blocked}`);
  if (blocked === 0) console.log("✅ ALL wallets are now claimable!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
