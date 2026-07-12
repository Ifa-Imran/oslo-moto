import { ethers } from "hardhat";

/**
 * Batch fix for all affected wallets with claim disabled.
 *
 * Wallet 0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839:
 *   - seededEarnings (585.61) exceeds 3X cap on Stake #2 (315)
 *   - Fix: adminSetSeededEarnings(target, 0)
 *
 * Wallet 0xbCDfa269B587d0FE12595734f3FC76Db187842aB:
 *   - seededEarnings (455.11) eating most of 3X cap (627)
 *   - totalEarnings (131.49) inflated by recordExternalEarning (level commissions)
 *   - Fix: adminSetSeededEarnings(target, 0) + adminSeedStake(target, 209, 1, 0)
 *
 * Usage: npx hardhat run scripts/debug/fix-batch-wallets.ts --network bscMainnet
 */

const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";

const ENGINE_ABI = [
  "function adminSetSeededEarnings(address user, uint256 amount) external",
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

  console.log("=".repeat(70));
  console.log("BATCH FIX — ALL AFFECTED WALLETS");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Engine:   ${ENGINE_ADDR}`);
  console.log(`Time:     ${new Date().toISOString()}`);

  // ============================================================
  // WALLET 1: 0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839
  // Fix: Reset seededEarnings to 0
  // ============================================================
  const WALLET_1 = "0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839";
  console.log("\n" + "=".repeat(70));
  console.log(`WALLET 1: ${WALLET_1}`);
  console.log("Fix: Reset seededEarnings to 0");
  console.log("=".repeat(70));

  // BEFORE
  console.log("\n--- BEFORE ---");
  const seeded1Before = await engine.seededEarnings(WALLET_1);
  const claimable1Before = await engine.getClaimableYield(WALLET_1);
  const accrued1Before = await engine.calculateAccruedYield(WALLET_1);
  const stakes1Before = await engine.getUserStakes(WALLET_1);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seeded1Before, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accrued1Before, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimable1Before, 18)} USDT`);
  console.log(`  Stakes:           ${stakes1Before.length}`);
  for (let i = 0; i < stakes1Before.length; i++) {
    const s = stakes1Before[i];
    console.log(`    #${i + 1}: ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // EXECUTE
  console.log("\n--- EXECUTING ---");
  console.log("  Sending tx: adminSetSeededEarnings(wallet1, 0)...");
  const tx1 = await engine.adminSetSeededEarnings(WALLET_1, 0);
  console.log(`  Tx hash: ${tx1.hash}`);
  const receipt1 = await tx1.wait();
  console.log(`  ✅ Confirmed in block ${receipt1?.blockNumber} (gas: ${receipt1?.gasUsed})`);

  // AFTER
  console.log("\n--- AFTER ---");
  const seeded1After = await engine.seededEarnings(WALLET_1);
  const claimable1After = await engine.getClaimableYield(WALLET_1);
  const accrued1After = await engine.calculateAccruedYield(WALLET_1);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seeded1After, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accrued1After, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimable1After, 18)} USDT`);
  if (claimable1After > 0n) {
    console.log(`  ✅ SUCCESS — ${ethers.formatUnits(claimable1After, 18)} USDT claimable now!`);
  } else {
    console.log(`  ⚠ Claimable still 0 — may need fresh stake or more yield accrual`);
  }

  // ============================================================
  // WALLET 2: 0xbCDfa269B587d0FE12595734f3FC76Db187842aB
  // Fix: Reset seededEarnings to 0 + Create fresh stake
  // ============================================================
  const WALLET_2 = "0xbCDfa269B587d0FE12595734f3FC76Db187842aB";
  console.log("\n" + "=".repeat(70));
  console.log(`WALLET 2: ${WALLET_2}`);
  console.log("Fix: Reset seededEarnings to 0 + Create fresh stake");
  console.log("=".repeat(70));

  // BEFORE
  console.log("\n--- BEFORE ---");
  const seeded2Before = await engine.seededEarnings(WALLET_2);
  const claimable2Before = await engine.getClaimableYield(WALLET_2);
  const accrued2Before = await engine.calculateAccruedYield(WALLET_2);
  const stakes2Before = await engine.getUserStakes(WALLET_2);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seeded2Before, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accrued2Before, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimable2Before, 18)} USDT`);
  console.log(`  Stakes:           ${stakes2Before.length}`);
  for (let i = 0; i < stakes2Before.length; i++) {
    const s = stakes2Before[i];
    console.log(`    #${i + 1}: ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // STEP 2a: Reset seededEarnings to 0
  console.log("\n--- STEP 1: Reset seededEarnings ---");
  console.log("  Sending tx: adminSetSeededEarnings(wallet2, 0)...");
  const tx2a = await engine.adminSetSeededEarnings(WALLET_2, 0);
  console.log(`  Tx hash: ${tx2a.hash}`);
  const receipt2a = await tx2a.wait();
  console.log(`  ✅ Confirmed in block ${receipt2a?.blockNumber} (gas: ${receipt2a?.gasUsed})`);

  // Check if fresh stake is needed (totalEarnings still blocking)
  const claimableMid = await engine.getClaimableYield(WALLET_2);
  console.log(`  Claimable after seededEarnings reset: ${ethers.formatUnits(claimableMid, 18)} USDT`);

  if (claimableMid === 0n) {
    // STEP 2b: Create fresh stake
    console.log("\n--- STEP 2: Create fresh stake ---");

    // Determine amount and tier from first active stake
    let stakeAmount = ethers.parseUnits("10", 18);
    let stakeTier = 1;
    for (const s of stakes2Before) {
      if (s.isActive && s.activeStake > 0n) {
        stakeAmount = s.activeStake;
        stakeTier = s.tier;
        break;
      }
    }

    console.log(`  Amount: ${ethers.formatUnits(stakeAmount, 18)} USDT`);
    console.log(`  Tier:   ${stakeTier}`);
    console.log("  Sending tx: adminSeedStake(wallet2, amount, tier, 0)...");
    const tx2b = await engine.adminSeedStake(WALLET_2, stakeAmount, stakeTier, 0);
    console.log(`  Tx hash: ${tx2b.hash}`);
    const receipt2b = await tx2b.wait();
    console.log(`  ✅ Confirmed in block ${receipt2b?.blockNumber} (gas: ${receipt2b?.gasUsed})`);
  } else {
    console.log("\n  ✅ No fresh stake needed — seededEarnings reset was sufficient!");
  }

  // AFTER
  console.log("\n--- AFTER ---");
  const seeded2After = await engine.seededEarnings(WALLET_2);
  const claimable2After = await engine.getClaimableYield(WALLET_2);
  const accrued2After = await engine.calculateAccruedYield(WALLET_2);
  const stakes2After = await engine.getUserStakes(WALLET_2);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seeded2After, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accrued2After, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimable2After, 18)} USDT`);
  console.log(`  Stakes:           ${stakes2After.length}`);
  for (let i = 0; i < stakes2After.length; i++) {
    const s = stakes2After[i];
    console.log(`    #${i + 1}: ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("BATCH FIX SUMMARY");
  console.log("=".repeat(70));
  console.log("\nWallet 1 (0x63382b...7839):");
  console.log(`  Seeded:  ${ethers.formatUnits(seeded1Before, 18)} → ${ethers.formatUnits(seeded1After, 18)} USDT`);
  console.log(`  Claimable: ${ethers.formatUnits(claimable1Before, 18)} → ${ethers.formatUnits(claimable1After, 18)} USDT`);
  console.log("\nWallet 2 (0xbCDfa2...42aB):");
  console.log(`  Seeded:  ${ethers.formatUnits(seeded2Before, 18)} → ${ethers.formatUnits(seeded2After, 18)} USDT`);
  console.log(`  Claimable: ${ethers.formatUnits(claimable2Before, 18)} → ${ethers.formatUnits(claimable2After, 18)} USDT`);
  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
