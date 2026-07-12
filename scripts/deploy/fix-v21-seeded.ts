import { ethers } from "hardhat";

/**
 * Fixes the 2 remaining blocked wallets in V2.1.
 *
 * Problem: The corrected formula moved excess totalEarnings → seededEarnings.
 * For users with large historical claims from now-inactive stakes, this inflated
 * seededEarnings so much that the 3X cap blocks ALL claims on new active stakes.
 *
 * Fix: Read original seededEarnings from V2 (before excess was added),
 * set V2.1 seededEarnings back to that original value.
 * The excess is "dropped" — it represented yield from old inactive stakes
 * that should NOT count against new stakes' 3X cap.
 *
 * Usage: npx hardhat run scripts/deploy/fix-v21-seeded.ts --network bscMainnet
 */

const SOURCE_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0"; // V2 (paused, readable)
const TARGET_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80"; // V2.1 (active)

const BLOCKED_WALLETS = [
  "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8",
  "0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839",
];

const ENGINE_ABI = [
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function totalClaimed(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const src = new ethers.Contract(SOURCE_ENGINE, ENGINE_ABI, deployer);
  const tgt = new ethers.Contract(TARGET_ENGINE, ENGINE_ABI, deployer);

  console.log("Fixing 2 blocked wallets — removing excess from seededEarnings\n");
  console.log(`BNB: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}\n`);

  for (const user of BLOCKED_WALLETS) {
    console.log("=".repeat(60));
    console.log(`Wallet: ${user}`);

    // Read original V2 seededEarnings
    const v2Seeded = BigInt(await src.seededEarnings(user));
    const v21Seeded = BigInt(await tgt.seededEarnings(user));
    const external = BigInt(await tgt.externalEarnings(user));
    const claimed = BigInt(await tgt.totalClaimed(user));

    console.log(`  V2  seededEarnings:   ${ethers.formatUnits(v2Seeded, 18)}`);
    console.log(`  V2.1 seededEarnings:  ${ethers.formatUnits(v21Seeded, 18)}`);
    console.log(`  Excess added:         ${ethers.formatUnits(v21Seeded - v2Seeded, 18)}`);
    console.log(`  externalEarnings:     ${ethers.formatUnits(external, 18)}`);
    console.log(`  totalClaimed:         ${ethers.formatUnits(claimed, 18)}`);

    // Current claimable
    const beforeClaimable = BigInt(await tgt.getClaimableYield(user));
    const beforeAccrued = BigInt(await tgt.calculateAccruedYield(user));
    console.log(`  Before fix — claimable: ${ethers.formatUnits(beforeClaimable, 18)}, accrued: ${ethers.formatUnits(beforeAccrued, 18)}`);

    // Set seededEarnings back to original V2 value
    console.log(`  Setting seededEarnings to ${ethers.formatUnits(v2Seeded, 18)}...`);
    const tx = await tgt.adminSetSeededEarnings(user, v2Seeded);
    await tx.wait();
    console.log(`  Tx: ${tx.hash}`);

    // Verify
    const afterClaimable = BigInt(await tgt.getClaimableYield(user));
    const afterAccrued = BigInt(await tgt.calculateAccruedYield(user));
    console.log(`  After fix — claimable: ${ethers.formatUnits(afterClaimable, 18)}, accrued: ${ethers.formatUnits(afterAccrued, 18)}`);

    if (afterClaimable > 0n) {
      console.log(`  ✅ UNBLOCKED!`);
    } else {
      console.log(`  ⚠️ Still blocked — may need further investigation`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
