import { ethers } from "hardhat";

/**
 * Fix script: Migrates two specific wallets' stakes from V1 → V2.
 *
 * These wallets were missed by the migration script because their referrer
 * was 0x0000000000000000000000000000000000000001 (not a known root),
 * so they were never discovered during referral tree traversal.
 *
 * This script follows the EXACT same migration formula as migrate-to-v2.ts:
 *   1. Read V1 stake data (stakes, totalClaimed, seededEarnings)
 *   2. Compute externalEarnings = max(0, sum(totalEarnings) - totalClaimed)
 *   3. Distribute totalClaimed across stakes proportionally
 *   4. Import each stake via adminImportStake
 *   5. Set seededEarnings, externalEarnings, totalClaimed
 *
 * Usage:
 *   npx hardhat run scripts/deploy/fix-missing-stakes.ts --network bscMainnet
 */

// ============ CONTRACT ADDRESSES ============
const OLD_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const NEW_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";

// ============ MISSING WALLETS ============
const MISSING_WALLETS = [
  "0x9843fEc7F7c7cd2A9B813A7C0DA3A2fe623e853F",
  "0xF1693617aF489b7f2c6C33F55dC4146751259b4f",
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

// ============ ABIs ============
const ENGINE_READ_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
];

const ENGINE_WRITE_ABI = [
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
  "function hasStaked(address) view returns (bool)",
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("FIX: Migrate Missing Stakes from V1 → V2");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BNB: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log();

  const oldEngine = new ethers.Contract(OLD_ENGINE, ENGINE_READ_ABI, deployer);
  const newEngine = new ethers.Contract(NEW_ENGINE, [...ENGINE_READ_ABI, ...ENGINE_WRITE_ABI], deployer);

  const currentTimestamp = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  console.log(`Block timestamp: ${currentTimestamp} (${new Date(Number(currentTimestamp) * 1000).toISOString()})`);
  console.log();

  // Before stats
  const [v1Users, v2UsersBefore] = await Promise.all([
    oldEngine.totalUsers(),
    newEngine.totalUsers(),
  ]);
  console.log(`Before: V1 users=${v1Users}, V2 users=${v2UsersBefore}`);
  console.log();

  for (const wallet of MISSING_WALLETS) {
    const addr = `${wallet.slice(0, 10)}...${wallet.slice(-8)}`;
    console.log("=".repeat(70));
    console.log(`Migrating: ${addr}`);
    console.log("=".repeat(70));

    // Safety check: skip if already in V2
    const v2HasStaked = await newEngine.hasStaked(wallet);
    if (v2HasStaked) {
      console.log("  ✓ Already has stakes in V2 — skipping.");
      console.log();
      continue;
    }

    // Read V1 data
    const v1Stakes = await oldEngine.getUserStakes(wallet);
    const v1Claimed = await oldEngine.totalClaimed(wallet);
    const v1Seeded = await oldEngine.seededEarnings(wallet);

    if (v1Stakes.length === 0) {
      console.log("  ⚠ No V1 stakes found — skipping.");
      console.log();
      continue;
    }

    console.log(`  V1 stakes: ${v1Stakes.length}`);
    console.log(`  V1 totalClaimed: ${v1Claimed.toString()}`);
    console.log(`  V1 seededEarnings: ${v1Seeded.toString()}`);

    // ---- Compute migration values (same formula as migrate-to-v2.ts) ----
    const stakes: UserStakeData[] = v1Stakes.map((s: any) => ({
      activeStake: s.activeStake,
      totalEarnings: s.totalEarnings,
      stakeStartTime: s.stakeStartTime,
      stakeDayIndex: s.stakeDayIndex,
      tier: s.tier,
      referrer: s.referrer,
      isActive: s.isActive,
    }));

    const totalClaimed = v1Claimed;
    const seeded = v1Seeded;

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
        v2TotalEarnings.push(totalClaimed - allocated);
      } else if (sumWeights > 0n) {
        const share = (totalClaimed * weights[i]) / sumWeights;
        v2TotalEarnings.push(share);
        allocated += share;
      } else {
        v2TotalEarnings.push(0n);
      }
    }

    console.log(`  Migration values:`);
    console.log(`    sumTotalEarnings: ${sumTotalEarnings.toString()}`);
    console.log(`    externalEarnings:  ${externalEarnings.toString()}`);
    for (let i = 0; i < stakes.length; i++) {
      console.log(`    Stake #${i}: v2_totalEarnings=${v2TotalEarnings[i].toString()}`);
    }

    // ---- Execute migration transactions ----
    console.log("\n  Importing stakes...");

    for (let i = 0; i < stakes.length; i++) {
      const s = stakes[i];
      console.log(`    Importing stake #${i}: activeStake=${s.activeStake.toString()}, totalEarnings=${v2TotalEarnings[i].toString()}, tier=${s.tier}, isActive=${s.isActive}`);
      const tx = await newEngine.adminImportStake(
        wallet,
        s.activeStake,
        v2TotalEarnings[i],
        s.stakeStartTime,
        s.stakeDayIndex,
        s.tier,
        s.referrer,
        s.isActive
      );
      const receipt = await tx.wait();
      console.log(`      ✓ tx: ${receipt.hash} (gas: ${receipt.gasUsed})`);
    }

    // Set seededEarnings
    if (seeded > 0n) {
      console.log(`  Setting seededEarnings: ${seeded.toString()}`);
      const tx = await newEngine.adminSetSeededEarnings(wallet, seeded);
      await tx.wait();
      console.log("    ✓ done");
    }

    // Set externalEarnings
    if (externalEarnings > 0n) {
      console.log(`  Setting externalEarnings: ${externalEarnings.toString()}`);
      const tx = await newEngine.adminSetExternalEarnings(wallet, externalEarnings);
      await tx.wait();
      console.log("    ✓ done");
    }

    // Set totalClaimed
    if (totalClaimed > 0n) {
      console.log(`  Setting totalClaimed: ${totalClaimed.toString()}`);
      const tx = await newEngine.adminSeedClaimed(wallet, totalClaimed);
      await tx.wait();
      console.log("    ✓ done");
    }

    // ---- Verify ----
    console.log("\n  --- Verification ---");
    const v2Stakes = await newEngine.getUserStakes(wallet);
    const v2Claimable = await newEngine.getClaimableYield(wallet);
    const v2Accrued = await newEngine.calculateAccruedYield(wallet);
    const v2ClaimedAfter = await newEngine.totalClaimed(wallet);
    const v2SeededAfter = await newEngine.seededEarnings(wallet);
    const v2External = await newEngine.externalEarnings(wallet);

    console.log(`    stakes count:    ${v2Stakes.length} (expected ${stakes.length})`);
    console.log(`    claimableYield:  ${v2Claimable.toString()}`);
    console.log(`    accruedYield:    ${v2Accrued.toString()}`);
    console.log(`    totalClaimed:    ${v2ClaimedAfter.toString()} (expected ${totalClaimed.toString()})`);
    console.log(`    seededEarnings:  ${v2SeededAfter.toString()} (expected ${seeded.toString()})`);
    console.log(`    externalEarnings: ${v2External.toString()} (expected ${externalEarnings.toString()})`);

    if (v2Stakes.length === stakes.length) {
      console.log("  ✅ MIGRATION SUCCESSFUL");
    } else {
      console.log("  ⚠️  STAKE COUNT MISMATCH!");
    }
    console.log();
  }

  // After stats
  const v2UsersAfter = await newEngine.totalUsers();
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`V2 users: ${v2UsersBefore} → ${v2UsersAfter} (delta: ${v2UsersAfter - v2UsersBefore})`);
  console.log(`Deployer BNB remaining: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
