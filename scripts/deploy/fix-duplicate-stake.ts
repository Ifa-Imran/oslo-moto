import { ethers } from "hardhat";

/**
 * Fixes the duplicate stake for wallet 0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69
 * on V2.1 WITHOUT redeploying any contract.
 *
 * STRATEGY:
 *   The V2.1 contract has no adminDeactivateStake function, but claimYield()
 *   auto-deactivates a stake when its 3X cap is hit (projectedTotal >= cap).
 *
 *   By temporarily inflating externalEarnings, we can make:
 *     - Stake [0] (legitimate): effectiveEarnings >= cap → SKIPPED (stays active, 0 claimable)
 *     - Stake [1] (duplicate): effectiveEarnings < cap BUT projectedTotal >= cap → DEACTIVATED
 *
 *   After the user calls claimYield(), the duplicate stake is deactivated.
 *   Then we reset externalEarnings back to 0.
 *
 *   Formula:
 *     cap = activeStake * 3 = 645 * 3 = 1935
 *     For stake[0] skipped: totalEarnings[0] + extE + seeded >= cap
 *     For stake[1] not skipped: 0 + extE + seeded < cap
 *     For stake[1] deactivated: extE + seeded + accrued[1] >= cap
 *
 *     => extE in [cap - seeded - accrued[1], cap - seeded)
 *     AND extE >= cap - seeded - totalEarnings[0]
 *
 * Usage: npx hardhat run scripts/deploy/fix-duplicate-stake.ts --network bscMainnet
 */

const WALLET = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
];

const TIER1_RATES = [100, 75, 95, 65, 100, 85, 55];
const TIER2_RATES = [115, 100, 115, 110, 105, 100, 125];
const ONE_DAY = 86400n;

function calcStakeYield(s: { isActive: boolean; stakeStartTime: bigint; stakeDayIndex: number; tier: number; activeStake: bigint }, ts: bigint): bigint {
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
  const provider = ethers.provider;
  const engine = new ethers.Contract(V21_ENGINE, ENGINE_ABI, deployer);

  console.log("=".repeat(60));
  console.log("FIX DUPLICATE STAKE (no redeployment)");
  console.log("=".repeat(60));
  console.log(`Wallet: ${WALLET}`);
  console.log(`V2.1:   ${V21_ENGINE}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  // 1. Get current state
  const stakes = await engine.getUserStakes(WALLET);
  const seeded = BigInt(await engine.seededEarnings(WALLET));
  const external = BigInt(await engine.externalEarnings(WALLET));
  const claimed = BigInt(await engine.totalClaimed(WALLET));
  const ts = BigInt((await provider.getBlock("latest"))!.timestamp);

  console.log(`Block timestamp: ${ts} (${new Date(Number(ts) * 1000).toISOString()})`);
  console.log(`Seeded earnings:   ${ethers.formatUnits(seeded, 18)}`);
  console.log(`External earnings: ${ethers.formatUnits(external, 18)}`);
  console.log(`Total claimed:     ${ethers.formatUnits(claimed, 18)}`);
  console.log(`Stakes: ${stakes.length}\n`);

  // 2. Per-stake analysis
  console.log("--- PER-STAKE ANALYSIS ---");
  let stake0Accrued = 0n;
  let stake1Accrued = 0n;
  let stake0Cap = 0n;
  let stake1Cap = 0n;

  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    const activeStake = BigInt(s.activeStake);
    const totalEarnings = BigInt(s.totalEarnings);
    const accrued = calcStakeYield({
      isActive: Boolean(s.isActive),
      stakeStartTime: BigInt(s.stakeStartTime),
      stakeDayIndex: Number(s.stakeDayIndex),
      tier: Number(s.tier),
      activeStake,
    }, ts);
    const cap = activeStake * 3n;
    const effectiveEarnings = totalEarnings + external + seeded;
    const claimable = accrued > totalEarnings ? accrued - totalEarnings : 0n;
    const projectedTotal = effectiveEarnings + claimable;

    console.log(`  Stake [${i}]:`);
    console.log(`    active=${s.isActive} stake=${ethers.formatUnits(activeStake, 18)} tier=${s.tier}`);
    console.log(`    totalEarnings=${ethers.formatUnits(totalEarnings, 18)}`);
    console.log(`    accrued=${ethers.formatUnits(accrued, 18)}`);
    console.log(`    claimable=${ethers.formatUnits(claimable, 18)}`);
    console.log(`    cap (3X)=${ethers.formatUnits(cap, 18)}`);
    console.log(`    effectiveEarnings=${ethers.formatUnits(effectiveEarnings, 18)}`);
    console.log(`    projectedTotal=${ethers.formatUnits(projectedTotal, 18)}`);
    console.log(`    skipped (eff>=cap): ${effectiveEarnings >= cap}`);
    console.log(`    deactivated on claim (proj>=cap): ${projectedTotal >= cap && effectiveEarnings < cap}`);

    if (i === 0) { stake0Accrued = accrued; stake0Cap = cap; }
    if (i === 1) { stake1Accrued = accrued; stake1Cap = cap; }
  }

  // 3. Calculate externalEarnings needed
  console.log("\n--- CALCULATING EXTERNAL EARNINGS ---");

  // Stake [0] (legitimate): totalEarnings[0] + extE + seeded >= cap[0]
  //   extE >= cap[0] - totalEarnings[0] - seeded
  const s0 = stakes[0];
  const te0 = BigInt(s0.totalEarnings);
  const cap0 = BigInt(s0.activeStake) * 3n;
  const lowerBound0 = cap0 - te0 - seeded; // extE must be >= this for stake[0] to be skipped

  // Stake [1] (duplicate): extE + seeded < cap[1] (not skipped)
  //   extE < cap[1] - seeded
  const s1 = stakes[1];
  const cap1 = BigInt(s1.activeStake) * 3n;
  const upperBound = cap1 - seeded; // extE must be < this for stake[1] to NOT be skipped

  // Stake [1] deactivated: extE + seeded + accrued[1] >= cap[1]
  //   extE >= cap[1] - seeded - accrued[1]
  const lowerBound1 = cap1 - seeded - stake1Accrued;

  console.log(`  Stake[0] skip condition:  extE >= ${ethers.formatUnits(lowerBound0, 18)}`);
  console.log(`  Stake[1] not-skip cond:   extE <  ${ethers.formatUnits(upperBound, 18)}`);
  console.log(`  Stake[1] deactivate cond: extE >= ${ethers.formatUnits(lowerBound1, 18)}`);

  const validLower = lowerBound0 > lowerBound1 ? lowerBound0 : lowerBound1;
  const validUpper = upperBound;

  console.log(`  Valid range: [${ethers.formatUnits(validLower, 18)}, ${ethers.formatUnits(validUpper, 18)})`);

  if (validLower >= validUpper) {
    console.log(`  ❌ No valid range! accrued[1] is too large or too small.`);
    console.log(`     Need accrued[1] >= ${ethers.formatUnits(cap0 - te0 - seeded - (cap1 - seeded - stake1Accrued) + 1n, 18)}`);
    console.log(`     Current accrued[1] = ${ethers.formatUnits(stake1Accrued, 18)}`);
    return;
  }

  // Pick a value in the middle of the valid range
  const targetExtE = (validLower + validUpper) / 2n;
  console.log(`\n  Target externalEarnings: ${ethers.formatUnits(targetExtE, 18)}`);

  // Verify the conditions
  const effE0 = te0 + targetExtE + seeded;
  const effE1 = BigInt(0n) + targetExtE + seeded;
  const proj1 = effE1 + stake1Accrued;

  console.log(`\n  Verification with extE = ${ethers.formatUnits(targetExtE, 18)}:`);
  console.log(`    Stake[0]: effectiveEarnings=${ethers.formatUnits(effE0, 18)}, cap=${ethers.formatUnits(cap0, 18)}, skipped=${effE0 >= cap0}`);
  console.log(`    Stake[1]: effectiveEarnings=${ethers.formatUnits(effE1, 18)}, cap=${ethers.formatUnits(cap1, 18)}, skipped=${effE1 >= cap1}`);
  console.log(`    Stake[1]: projectedTotal=${ethers.formatUnits(proj1, 18)}, cap=${ethers.formatUnits(cap1, 18)}, deactivated=${proj1 >= cap1 && effE1 < cap1}`);

  if (effE0 < cap0) {
    console.log(`  ❌ Stake[0] would NOT be skipped — it might get deactivated too!`);
    console.log(`     Need extE >= ${ethers.formatUnits(lowerBound0, 18)}`);
    return;
  }
  if (effE1 >= cap1) {
    console.log(`  ❌ Stake[1] would be skipped — it won't get deactivated!`);
    console.log(`     Need extE < ${ethers.formatUnits(upperBound, 18)}`);
    return;
  }
  if (proj1 < cap1) {
    console.log(`  ❌ Stake[1] projectedTotal < cap — won't get deactivated!`);
    console.log(`     Need extE >= ${ethers.formatUnits(lowerBound1, 18)} or wait for more accrued yield.`);
    return;
  }

  console.log(`\n  ✅ All conditions met! Setting externalEarnings...`);

  // 4. Set externalEarnings
  const tx = await engine.adminSetExternalEarnings(WALLET, targetExtE);
  await tx.wait();
  console.log(`  ✓ externalEarnings set to ${ethers.formatUnits(targetExtE, 18)} (block ${tx.blockNumber})`);

  // 5. Verify the new state
  const newClaimable = await engine.getClaimableYield(WALLET);
  const newActive = await engine.getTotalActiveStake(WALLET);
  console.log(`\n--- POST-SET STATE ---`);
  console.log(`  Total active stake: ${ethers.formatUnits(newActive, 18)} USDT (still 1290, duplicate still active)`);
  console.log(`  Claimable yield:    ${ethers.formatUnits(newClaimable, 18)} USDT (from duplicate stake [1] only)`);

  if (newClaimable > 0n) {
    console.log(`\n  ✅ User now needs to call claimYield() on the dApp.`);
    console.log(`     This will deactivate the duplicate stake [1] and reduce totalActiveStake by 645 USDT.`);
    console.log(`     After the user claims, run the reset script to set externalEarnings back to 0.`);
  } else {
    console.log(`\n  ⚠️  Claimable is 0 — the user won't be able to call claimYield().`);
    console.log(`     Need to wait for more accrued yield on stake [1].`);
    console.log(`     Current accrued[1] = ${ethers.formatUnits(stake1Accrued, 18)}`);
    console.log(`     Need at least:     ${ethers.formatUnits(cap1 - seeded - targetExtE, 18)}`);
  }

  console.log("\n" + "=".repeat(60));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
