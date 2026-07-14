import { ethers } from "hardhat";

/**
 * Scans the OLD pre-V1 contract for ALL users who have stakes but are NOT on V2.1.
 * Uses the same referral tree BFS traversal to find all registered wallets,
 * then checks each against both the old contract and V2.1.
 *
 * Usage: npx hardhat run scripts/debug/scan-old-contract.ts --network bscMainnet
 */

const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const V1_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const V2_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const KNOWN_ROOTS = [
  "0xb259fcC202b17C124201C872c52f108ade380B4F", // Deployer
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // Reward wallet
  "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56", // Company wallet
  "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4", // Performance wallet
];

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function getDirectDownlines(address) view returns (address[])",
  "function directReferrer(address) view returns (address)",
];

async function main() {
  const provider = ethers.provider;
  console.log("=".repeat(60));
  console.log("SCAN OLD CONTRACT FOR MISSED WALLETS");
  console.log("=".repeat(60));
  console.log(`Old engine:  ${OLD_ENGINE}`);
  console.log(`V1 engine:   ${V1_ENGINE}`);
  console.log(`V2 engine:   ${V2_ENGINE}`);
  console.log(`V2.1 engine: ${V21_ENGINE}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const oldEngine = new ethers.Contract(OLD_ENGINE, ENGINE_ABI, provider);
  const v1Engine = new ethers.Contract(V1_ENGINE, ENGINE_ABI, provider);
  const v2Engine = new ethers.Contract(V2_ENGINE, ENGINE_ABI, provider);
  const v21Engine = new ethers.Contract(V21_ENGINE, ENGINE_ABI, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);

  // Contract stats
  const [oldUsers, oldActive, oldTurnover] = await Promise.all([
    oldEngine.totalUsers(),
    oldEngine.totalActiveStakes(),
    oldEngine.totalProtocolTurnover(),
  ]);
  const [v21Users, v21Active, v21Turnover] = await Promise.all([
    v21Engine.totalUsers(),
    v21Engine.totalActiveStakes(),
    v21Engine.totalProtocolTurnover(),
  ]);

  console.log("Contract stats:");
  console.log(`  Old:  ${oldUsers} users, ${ethers.formatUnits(oldActive, 18)} active, ${ethers.formatUnits(oldTurnover, 18)} turnover`);
  console.log(`  V2.1: ${v21Users} users, ${ethers.formatUnits(v21Active, 18)} active, ${ethers.formatUnits(v21Turnover, 18)} turnover`);

  // BFS referral tree
  console.log("\nTraversing referral tree...");
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
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    try {
      const dl = await registry.getDirectDownlines(cur);
      for (const d of dl) {
        allUsers.add(d);
        if (!visited.has(d)) queue.push(d);
      }
    } catch {}
  }
  console.log(`  Found ${allUsers.size} unique registered wallets\n`);

  // Check each wallet
  const missed: { address: string; stakes: number; active: bigint; claimable: bigint; claimed: bigint; onV1: boolean; onV2: boolean }[] = [];
  const alreadyOnV21: string[] = [];
  const notOnOld: string[] = [];

  let count = 0;
  for (const user of allUsers) {
    count++;
    if (count % 30 === 0) console.log(`  Progress: ${count}/${allUsers.size}...`);

    try {
      const oldHas = await oldEngine.hasStaked(user);
      if (!oldHas) {
        notOnOld.push(user);
        continue;
      }

      const oldStakes = await oldEngine.getUserStakes(user);
      if (oldStakes.length === 0) {
        notOnOld.push(user);
        continue;
      }

      // Check if already on V2.1
      const v21Has = await v21Engine.hasStaked(user);
      if (v21Has) {
        alreadyOnV21.push(user);
        continue;
      }

      // This wallet is on old contract but NOT on V2.1 — MISSED!
      let totalActive = 0n;
      for (const s of oldStakes) {
        totalActive += BigInt(s.activeStake);
      }
      const claimable = await oldEngine.getClaimableYield(user);
      const claimed = await oldEngine.totalClaimed(user);

      // Also check V1 and V2
      const v1Has = await v1Engine.hasStaked(user).catch(() => false);
      const v2Has = await v2Engine.hasStaked(user).catch(() => false);

      missed.push({
        address: user,
        stakes: oldStakes.length,
        active: totalActive,
        claimable,
        claimed,
        onV1: v1Has,
        onV2: v2Has,
      });
    } catch {}
  }

  // Results
  console.log("\n" + "=".repeat(60));
  console.log("SCAN RESULTS");
  console.log("=".repeat(60));
  console.log(`  Total registered wallets: ${allUsers.size}`);
  console.log(`  On old contract + already on V2.1: ${alreadyOnV21.length}`);
  console.log(`  Not on old contract (registered only): ${notOnOld.length}`);
  console.log(`  ⚠️  ON OLD CONTRACT BUT MISSING FROM V2.1: ${missed.length}`);

  if (missed.length > 0) {
    console.log("\n--- MISSED WALLETS ---");
    let totalMissedActive = 0n;
    let totalMissedClaimable = 0n;
    for (const m of missed) {
      console.log(`  ${m.address}`);
      console.log(`    Stakes: ${m.stakes}, Active: ${ethers.formatUnits(m.active, 18)} USDT, Claimable: ${ethers.formatUnits(m.claimable, 18)}, Claimed: ${ethers.formatUnits(m.claimed, 18)}`);
      console.log(`    On V1: ${m.onV1}, On V2: ${m.onV2}`);
      totalMissedActive += m.active;
      totalMissedClaimable += m.claimable;
    }
    console.log(`\n  TOTAL missed active stake: ${ethers.formatUnits(totalMissedActive, 18)} USDT`);
    console.log(`  TOTAL missed claimable:    ${ethers.formatUnits(totalMissedClaimable, 18)} USDT`);
  } else {
    console.log("\n  ✅ All wallets from old contract are on V2.1!");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
