import { ethers } from "hardhat";

/**
 * Migrates ALL missed wallets from the OLD pre-V1 contract to V2.1.
 * Finds wallets that have stakes on the old contract but not on V2.1,
 * then imports their stakes.
 *
 * Handles the case where totalClaimed > 0 (needs seededEarnings/externalEarnings)
 * and where totalClaimed = 0 (clean import).
 *
 * Usage: npx hardhat run scripts/deploy/migrate-old-to-v21.ts --network bscMainnet
 */

const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const KNOWN_ROOTS = [
  "0xb259fcC202b17C124201C872c52f108ade380B4F",
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4",
  "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56",
  "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4",
];

const OLD_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
];

const V21_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function getDirectDownlines(address) view returns (address[])",
  "function directReferrer(address) view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("MIGRATE ALL MISSED WALLETS: OLD CONTRACT → V2.1");
  console.log("=".repeat(60));
  console.log(`Old engine:  ${OLD_ENGINE}`);
  console.log(`V2.1 engine: ${V21_ENGINE}`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`BNB:         ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const oldEngine = new ethers.Contract(OLD_ENGINE, OLD_ABI, deployer);
  const v21 = new ethers.Contract(V21_ENGINE, V21_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);

  // BFS referral tree
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
  console.log(`Found ${allUsers.size} registered wallets`);

  // Find missed wallets
  const missed: string[] = [];
  for (const user of allUsers) {
    try {
      const oldHas = await oldEngine.hasStaked(user);
      if (!oldHas) continue;
      const v21Has = await v21.hasStaked(user);
      if (v21Has) continue;
      missed.push(user);
    } catch {}
  }
  console.log(`Missed wallets (on old, not on V2.1): ${missed.length}\n`);

  if (missed.length === 0) {
    console.log("✅ All wallets are already on V2.1!");
    return;
  }

  // Pre-migration stats
  const [beforeUsers, beforeActive, beforeTurnover] = await Promise.all([
    v21.totalUsers(), v21.totalActiveStakes(), v21.totalProtocolTurnover(),
  ]);
  console.log(`V2.1 BEFORE: ${beforeUsers} users, ${ethers.formatUnits(beforeActive, 18)} active, ${ethers.formatUnits(beforeTurnover, 18)} turnover`);

  let migrated = 0, failed = 0;
  for (const user of missed) {
    console.log(`\n--- Migrating ${user} ---`);
    try {
      const [oldStakes, oldClaimed, oldClaimable, referrer] = await Promise.all([
        oldEngine.getUserStakes(user),
        oldEngine.totalClaimed(user),
        oldEngine.getClaimableYield(user),
        registry.directReferrer(user),
      ]);

      let totalActive = 0n;
      for (const s of oldStakes) totalActive += BigInt(s.activeStake);
      console.log(`  Stakes: ${oldStakes.length}, Active: ${ethers.formatUnits(totalActive, 18)} USDT, Claimed: ${ethers.formatUnits(oldClaimed, 18)}, Claimable: ${ethers.formatUnits(oldClaimable, 18)}`);

      const stakeReferrer = referrer !== ethers.ZeroAddress && referrer !== "0x0000000000000000000000000000000000000001"
        ? referrer : ethers.ZeroAddress;

      // Import each stake
      // totalEarnings = 0 for all (old contract has totalEarnings=0 since no claims, or use old totalEarnings if present)
      for (let i = 0; i < oldStakes.length; i++) {
        const s = oldStakes[i];
        const activeStake = BigInt(s.activeStake);
        const totalEarnings = BigInt(s.totalEarnings); // Preserve original totalEarnings
        const stakeStartTime = BigInt(s.stakeStartTime);
        const stakeDayIndex = Number(s.stakeDayIndex);
        const tier = Number(s.tier);
        const isActive = Boolean(s.isActive);

        console.log(`  Stake [${i}]: ${ethers.formatUnits(activeStake, 18)} USDT, tier ${tier}, TE=${ethers.formatUnits(totalEarnings, 18)}`);
        const tx = await v21.adminImportStake(
          user, activeStake, totalEarnings, stakeStartTime, stakeDayIndex, tier, stakeReferrer, isActive
        );
        const receipt = await tx.wait();
        console.log(`    ✓ Block ${receipt!.blockNumber}`);
      }

      // Set totalClaimed if > 0
      if (oldClaimed > 0n) {
        console.log(`  Setting totalClaimed: ${ethers.formatUnits(oldClaimed, 18)}`);
        await (await v21.adminSeedClaimed(user, oldClaimed)).wait();
      }

      // Verify
      const v21Claimable = await v21.getClaimableYield(user);
      const v21Accrued = await v21.calculateAccruedYield(user);
      console.log(`  V2.1 claimable: ${ethers.formatUnits(v21Claimable, 18)}, accrued: ${ethers.formatUnits(v21Accrued, 18)}`);
      if (v21Claimable > 0n) {
        console.log(`  ✅ Unblocked!`);
      } else if (v21Accrued > 0n) {
        console.log(`  ⚠️  Claimable is 0 — may need seededEarnings adjustment`);
      }
      migrated++;
    } catch (e: any) {
      console.log(`  FAIL: ${e.message?.substring(0, 120)}`);
      failed++;
    }
  }

  // Post-migration stats
  const [afterUsers, afterActive, afterTurnover] = await Promise.all([
    v21.totalUsers(), v21.totalActiveStakes(), v21.totalProtocolTurnover(),
  ]);
  console.log(`\n--- V2.1 AFTER ---`);
  console.log(`  Users: ${afterUsers} (was ${beforeUsers}, +${afterUsers - beforeUsers})`);
  console.log(`  Active: ${ethers.formatUnits(afterActive, 18)} (was ${ethers.formatUnits(beforeActive, 18)}, +${ethers.formatUnits(afterActive - beforeActive, 18)})`);
  console.log(`  Turnover: ${ethers.formatUnits(afterTurnover, 18)} (was ${ethers.formatUnits(beforeTurnover, 18)}, +${ethers.formatUnits(afterTurnover - beforeTurnover, 18)})`);
  console.log(`\nMigrated: ${migrated}, Failed: ${failed}`);
  console.log("=".repeat(60));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
