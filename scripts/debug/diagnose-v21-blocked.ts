import { ethers } from "hardhat";

/**
 * Diagnoses the 2 remaining blocked wallets in V2.1.
 * Shows per-stake details: activeStake, totalEarnings, accruedYield, claimable
 *
 * Usage: npx hardhat run scripts/debug/diagnose-v21-blocked.ts --network bscMainnet
 */

const TARGET_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
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
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
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

  const ts = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  console.log(`Scanning ${allUsers.size} wallets on V2.1...\n`);

  let blocked = 0;
  for (const user of allUsers) {
    try {
      const hasStaked = await tgt.hasStaked(user);
      if (!hasStaked) continue;

      const [claimable, accrued] = await Promise.all([
        tgt.getClaimableYield(user),
        tgt.calculateAccruedYield(user),
      ]);

      if (claimable === 0n && accrued > 0n) {
        blocked++;
        const [stakes, claimed, seeded, external] = await Promise.all([
          tgt.getUserStakes(user),
          tgt.totalClaimed(user),
          tgt.seededEarnings(user),
          tgt.externalEarnings(user),
        ]);

        console.log("=".repeat(70));
        console.log(`BLOCKED WALLET #${blocked}: ${user}`);
        console.log(`  totalClaimed:     ${ethers.formatUnits(claimed, 18)}`);
        console.log(`  seededEarnings:   ${ethers.formatUnits(seeded, 18)}`);
        console.log(`  externalEarnings: ${ethers.formatUnits(external, 18)}`);
        console.log(`  accruedYield:     ${ethers.formatUnits(accrued, 18)}`);
        console.log(`  claimableYield:   ${ethers.formatUnits(claimable, 18)}`);
        console.log(`  Stakes (${stakes.length}):`);

        for (let i = 0; i < stakes.length; i++) {
          const s = stakes[i];
          const sActive = Boolean(s.isActive);
          const sActiveStake = BigInt(s.activeStake);
          const sTE = BigInt(s.totalEarnings);
          const sStart = BigInt(s.stakeStartTime);
          const sDayIdx = Number(s.stakeDayIndex);
          const sTier = Number(s.tier);

          const sAccrued = calcYield({
            isActive: sActive,
            stakeStartTime: sStart,
            stakeDayIndex: sDayIdx,
            tier: sTier,
            activeStake: sActiveStake,
          }, ts);

          const sClaimable = sAccrued > sTE ? sAccrued - sTE : 0n;

          console.log(`    [${i}] active=${sActive} tier=${sTier} stake=${ethers.formatUnits(sActiveStake, 18)}`);
          console.log(`        totalEarnings=${ethers.formatUnits(sTE, 18)} accrued=${ethers.formatUnits(sAccrued, 18)} claimable=${ethers.formatUnits(sClaimable, 18)}`);
          console.log(`        startTime=${sStart} dayIndex=${sDayIdx}`);
          if (sTE >= sAccrued && sActive) {
            console.log(`        ⚠️  totalEarnings >= accruedYield (capped by migration)`);
            console.log(`        Excess = ${ethers.formatUnits(sTE - sAccrued, 18)} → went to seededEarnings`);
          }
        }
      }
    } catch {}
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Total blocked: ${blocked}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
