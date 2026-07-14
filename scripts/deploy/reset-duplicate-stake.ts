import { ethers } from "hardhat";

/**
 * Reset script: Run AFTER the user has called claimYield() on the dApp.
 * This resets externalEarnings back to 0 and verifies the duplicate stake was deactivated.
 *
 * Usage: npx hardhat run scripts/deploy/reset-duplicate-stake.ts --network bscMainnet
 */

const WALLET = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const engine = new ethers.Contract(V21_ENGINE, ENGINE_ABI, deployer);

  console.log("=".repeat(60));
  console.log("RESET DUPLICATE STAKE FIX");
  console.log("=".repeat(60));
  console.log(`Wallet: ${WALLET}\n`);

  // 1. Check current state
  const stakes = await engine.getUserStakes(WALLET);
  const external = BigInt(await engine.externalEarnings(WALLET));
  const claimable = await engine.getClaimableYield(WALLET);
  const active = await engine.getTotalActiveStake(WALLET);

  console.log("--- CURRENT STATE ---");
  console.log(`  External earnings: ${ethers.formatUnits(external, 18)}`);
  console.log(`  Total active:      ${ethers.formatUnits(active, 18)} USDT`);
  console.log(`  Claimable:         ${ethers.formatUnits(claimable, 18)} USDT`);
  console.log(`  Stakes: ${stakes.length}`);
  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    console.log(`    [${i}] active=${s.isActive} stake=${ethers.formatUnits(s.activeStake, 18)} USDT totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // 2. Check if duplicate stake [1] is deactivated
  const stake1Active = stakes.length > 1 ? Boolean(stakes[1].isActive) : true;

  if (stake1Active) {
    console.log("\n  ⚠️  Duplicate stake [1] is STILL ACTIVE!");
    console.log("     The user has NOT yet called claimYield().");
    console.log("     Claimable yield: " + ethers.formatUnits(claimable, 18) + " USDT");
    console.log("     Ask the user to claim yield on the dApp, then re-run this script.");
    return;
  }

  console.log("\n  ✅ Duplicate stake [1] is DEACTIVATED!");

  // 3. Reset externalEarnings to 0
  if (external > 0n) {
    console.log(`\n  Resetting externalEarnings from ${ethers.formatUnits(external, 18)} to 0...`);
    const tx = await engine.adminSetExternalEarnings(WALLET, 0n);
    await tx.wait();
    console.log(`  ✓ externalEarnings reset to 0`);
  } else {
    console.log("\n  externalEarnings already 0 — nothing to reset.");
  }

  // 4. Final verification
  const finalClaimable = await engine.getClaimableYield(WALLET);
  const finalActive = await engine.getTotalActiveStake(WALLET);
  const finalExternal = await engine.externalEarnings(WALLET);

  console.log("\n--- FINAL STATE ---");
  console.log(`  External earnings: ${ethers.formatUnits(finalExternal, 18)}`);
  console.log(`  Total active:      ${ethers.formatUnits(finalActive, 18)} USDT`);
  console.log(`  Claimable:         ${ethers.formatUnits(finalClaimable, 18)} USDT`);

  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    console.log(`  Stake [${i}]: active=${s.isActive} stake=${ethers.formatUnits(s.activeStake, 18)} USDT`);
  }

  if (finalActive <= 700n * 10n ** 18n && finalClaimable > 0n) {
    console.log(`\n  ✅ FIX COMPLETE! Wallet shows ${ethers.formatUnits(finalActive, 18)} USDT active stake.`);
  } else if (finalActive > 700n * 10n ** 18n) {
    console.log(`\n  ⚠️  Active stake is still > 645 USDT — check stake states.`);
  }

  console.log("\n" + "=".repeat(60));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
