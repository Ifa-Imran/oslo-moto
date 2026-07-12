import { ethers } from "hardhat";

/**
 * Batch Fix: Reset seededEarnings + create fresh stakes for all affected wallets.
 *
 * For each affected wallet:
 *   1. Reset seededEarnings to 0 via adminSetSeededEarnings
 *   2. Check if claimableYield > 0 (some wallets unblocked by reset alone)
 *   3. If still blocked, create fresh stake via adminSeedStake with totalEarnings=0
 *   4. Verify claimableYield > 0 after fix
 *
 * Usage: npx hardhat run scripts/debug/fix-all-affected-wallets.ts --network bscMainnet
 */

const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";

const AFFECTED_WALLETS = [
  "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8",
  "0x9fb859CF72Cca8Bb29C775725619d779986137D5",
  "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69",
  "0x2A4cEFED3E7Dd74F40E97e7bd6827A33e5a0e3Fd",
  "0x69921E17EBD81B637Bd28E7935eC39Ee140871EC",
  "0x0FcD084B1d50B41cBae9F45a8d71D3025e6BbA09",
  "0xE3926aCB77Bf33258C8c6239f41F9Eb91c7053CF",
  "0x7acc4a3aDDe55b950d85B48B215feD48CA4472A5",
  "0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839",
  "0xb272D6c85e2DCDA0aa105aDEEEB17c0BA0BFF0Df",
  "0x1c2783b0B4B0085f0a493AF16eB9c17FdB0e8e21",
  "0x69c9cA0C5b055eb336A9f5c356087f94E085ec21",
];

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSeedStake(address user, uint256 amount, uint8 tier, uint256 earnings) external",
];

interface FixResult {
  address: string;
  resetSeeded: boolean;
  freshStakeCreated: boolean;
  stakeAmount?: string;
  stakeTier?: number;
  claimableBefore: string;
  claimableAfter: string;
  success: boolean;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, deployer);

  console.log("=".repeat(70));
  console.log("BATCH FIX: Reset seededEarnings + fresh stakes for 12 wallets");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Time:     ${new Date().toISOString()}`);
  console.log(`Wallets:  ${AFFECTED_WALLETS.length}`);

  const results: FixResult[] = [];

  for (let i = 0; i < AFFECTED_WALLETS.length; i++) {
    const wallet = AFFECTED_WALLETS[i];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[${i + 1}/${AFFECTED_WALLETS.length}] Wallet: ${wallet}`);
    console.log("=".repeat(70));

    // ---- Pre-fix status ----
    const [stakes, claimableBefore, seeded, accrued] = await Promise.all([
      engine.getUserStakes(wallet),
      engine.getClaimableYield(wallet),
      engine.seededEarnings(wallet),
      engine.calculateAccruedYield(wallet),
    ]);

    console.log(`  Stakes:          ${stakes.length}`);
    console.log(`  Accrued:         ${ethers.formatUnits(accrued, 18)} USDT`);
    console.log(`  Claimable:       ${ethers.formatUnits(claimableBefore, 18)} USDT`);
    console.log(`  Seeded Earnings: ${ethers.formatUnits(seeded, 18)} USDT`);

    // Find the best stake to replicate (largest active stake)
    let bestStake: { amount: bigint; tier: number } | null = null;
    for (const s of stakes) {
      if (s.isActive && s.activeStake > 0n) {
        if (!bestStake || s.activeStake > bestStake.amount) {
          bestStake = { amount: s.activeStake, tier: s.tier };
        }
      }
    }

    // If no active stake, use the largest inactive stake (to maintain earning capacity)
    if (!bestStake) {
      for (const s of stakes) {
        if (s.activeStake > 0n) {
          if (!bestStake || s.activeStake > bestStake.amount) {
            bestStake = { amount: s.activeStake, tier: s.tier };
          }
        }
      }
    }

    let resetSeeded = false;
    let freshStakeCreated = false;
    let stakeAmount: string | undefined;
    let stakeTier: number | undefined;

    // ---- Step 1: Reset seededEarnings ----
    if (seeded > 0n) {
      console.log(`\n  Step 1: Reset seededEarnings to 0...`);
      const tx1 = await engine.adminSetSeededEarnings(wallet, 0);
      console.log(`  Tx: ${tx1.hash}`);
      await tx1.wait();
      console.log(`  ✅ Seeded earnings reset to 0`);
      resetSeeded = true;
    } else {
      console.log(`\n  Step 1: Skipped (seededEarnings already 0)`);
    }

    // ---- Check if reset alone fixed it ----
    const claimableMid = await engine.getClaimableYield(wallet);
    console.log(`  Claimable after reset: ${ethers.formatUnits(claimableMid, 18)} USDT`);

    // ---- Step 2: Create fresh stake if still blocked ----
    if (claimableMid === 0n && bestStake) {
      stakeAmount = ethers.formatUnits(bestStake.amount, 18);
      stakeTier = bestStake.tier;
      console.log(`\n  Step 2: Create fresh stake (${stakeAmount} USDT, Tier ${stakeTier})...`);
      const tx2 = await engine.adminSeedStake(wallet, bestStake.amount, bestStake.tier, 0);
      console.log(`  Tx: ${tx2.hash}`);
      await tx2.wait();
      console.log(`  ✅ Fresh stake created (totalEarnings=0)`);
      freshStakeCreated = true;
    } else if (claimableMid > 0n) {
      console.log(`  ✅ Reset alone unblocked claims — no fresh stake needed`);
    } else {
      console.log(`  ⚠ No suitable stake found to replicate — manual intervention needed`);
    }

    // ---- Verify ----
    const claimableAfter = await engine.getClaimableYield(wallet);
    console.log(`\n  RESULT:`);
    console.log(`    Claimable before: ${ethers.formatUnits(claimableBefore, 18)} USDT`);
    console.log(`    Claimable after:  ${ethers.formatUnits(claimableAfter, 18)} USDT`);
    console.log(`    Success: ${claimableAfter > 0n ? "✅" : "❌"}`);

    results.push({
      address: wallet,
      resetSeeded,
      freshStakeCreated,
      stakeAmount,
      stakeTier,
      claimableBefore: ethers.formatUnits(claimableBefore, 18),
      claimableAfter: ethers.formatUnits(claimableAfter, 18),
      success: claimableAfter > 0n,
    });
  }

  // ---- Summary ----
  console.log("\n" + "=".repeat(70));
  console.log("BATCH FIX SUMMARY");
  console.log("=".repeat(70));

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  Total wallets:    ${results.length}`);
  console.log(`  Fixed:            ${succeeded.length}`);
  console.log(`  Failed:           ${failed.length}`);
  console.log(`  Seeded resets:    ${results.filter(r => r.resetSeeded).length}`);
  console.log(`  Fresh stakes:     ${results.filter(r => r.freshStakeCreated).length}`);

  console.log("\n  Wallet                                        | Before     | After      | Fixed");
  console.log("  " + "-".repeat(100));
  for (const r of results) {
    const addr = `${r.address.slice(0, 8)}...${r.address.slice(-6)}`;
    console.log(`  ${addr} | ${r.claimableBefore.padStart(10)} | ${r.claimableAfter.padStart(10)} | ${r.success ? "✅" : "❌"}`);
  }

  if (failed.length > 0) {
    console.log("\n  ⚠ Failed wallets need manual investigation:");
    for (const r of failed) {
      console.log(`    ${r.address}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("⚠ NOTE: This is a TEMPORARY fix. The totalEarnings dual-use flaw");
  console.log("  will recur for active referrers when downlines claim yield.");
  console.log("  Permanent fix: Redeploy InvestmentEngine with externalEarnings");
  console.log("  separation (see contracts/core/InvestmentEngineV2.sol).");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
