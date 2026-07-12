import { ethers } from "hardhat";

/**
 * Fix: Create a fresh stake for a user whose existing stake has totalEarnings
 * inflated by recordExternalEarning (level commissions), blocking staking
 * yield claims because accrued < totalEarnings.
 *
 * adminSeedStake creates a new stake with totalEarnings = 0, so staking yield
 * will be claimable immediately.
 *
 * Usage: npx hardhat run scripts/debug/fix-create-fresh-stake.ts --network bscMainnet
 */

const TARGET_WALLET = "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8";
const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";

const ENGINE_ABI = [
  "function adminSeedStake(address user, uint256 amount, uint8 tier, uint256 earnings) external",
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function totalClaimed(address) view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, deployer);

  console.log("=".repeat(60));
  console.log("CREATE FRESH STAKE (unblock yield claiming)");
  console.log("=".repeat(60));
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Target:    ${TARGET_WALLET}`);

  // 1. Read BEFORE state
  console.log("\n--- BEFORE ---");
  const stakesBefore = await engine.getUserStakes(TARGET_WALLET);
  const claimableBefore = await engine.getClaimableYield(TARGET_WALLET);
  const accruedBefore = await engine.calculateAccruedYield(TARGET_WALLET);
  const activeStakeBefore = await engine.getTotalActiveStake(TARGET_WALLET);
  const seededBefore = await engine.seededEarnings(TARGET_WALLET);

  console.log(`  Stake count:       ${stakesBefore.length}`);
  console.log(`  Total Active Stake:${ethers.formatUnits(activeStakeBefore, 18)} USDT`);
  console.log(`  Seeded Earnings:   ${ethers.formatUnits(seededBefore, 18)} USDT`);
  console.log(`  Accrued Yield:     ${ethers.formatUnits(accruedBefore, 18)} USDT`);
  console.log(`  Claimable Yield:   ${ethers.formatUnits(claimableBefore, 18)} USDT`);

  for (let i = 0; i < stakesBefore.length; i++) {
    const s = stakesBefore[i];
    console.log(`  Stake #${i + 1}: ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // 2. Determine amount and tier from the first active stake
  let stakeAmount = ethers.parseUnits("10", 18);
  let stakeTier = 1;
  for (const s of stakesBefore) {
    if (s.isActive && s.activeStake > 0n) {
      stakeAmount = s.activeStake;
      stakeTier = s.tier;
      break;
    }
  }

  console.log(`\n--- CREATING NEW STAKE ---`);
  console.log(`  Amount: ${ethers.formatUnits(stakeAmount, 18)} USDT`);
  console.log(`  Tier:   ${stakeTier}`);
  console.log(`  Earnings (seeded): 0 (fresh stake)`);

  // 3. Execute adminSeedStake(user, amount, tier, 0)
  console.log("  Sending tx: adminSeedStake(target, amount, tier, 0)...");
  const tx = await engine.adminSeedStake(TARGET_WALLET, stakeAmount, stakeTier, 0);
  console.log(`  Tx hash: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log(`  ✅ Confirmed in block ${receipt?.blockNumber} (gas: ${receipt?.gasUsed})`);

  // 4. Read AFTER state
  console.log("\n--- AFTER ---");
  const stakesAfter = await engine.getUserStakes(TARGET_WALLET);
  const claimableAfter = await engine.getClaimableYield(TARGET_WALLET);
  const accruedAfter = await engine.calculateAccruedYield(TARGET_WALLET);
  const activeStakeAfter = await engine.getTotalActiveStake(TARGET_WALLET);

  console.log(`  Stake count:       ${stakesAfter.length}`);
  console.log(`  Total Active Stake:${ethers.formatUnits(activeStakeAfter, 18)} USDT`);
  console.log(`  Accrued Yield:     ${ethers.formatUnits(accruedAfter, 18)} USDT`);
  console.log(`  Claimable Yield:   ${ethers.formatUnits(claimableAfter, 18)} USDT`);

  for (let i = 0; i < stakesAfter.length; i++) {
    const s = stakesAfter[i];
    console.log(`  Stake #${i + 1}: ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // 5. Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ Fresh stake created!");
  console.log(`   The new stake has totalEarnings = 0, so staking yield`);
  console.log(`   will be claimable as soon as it accrues (within minutes).`);
  console.log("");
  console.log(`   NOTE: The old stake (Stake #1) still has totalEarnings`);
  console.log(`   inflated by level commissions. Its staking yield remains`);
  console.log(`   blocked until accrued > totalEarnings (may take weeks).`);
  console.log(`   The new stake is unaffected and can claim immediately.`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
