import { ethers } from "hardhat";

/**
 * Fix: Reset seededEarnings to 0 for a wallet whose historical earnings
 * exceed the 3X cap of their current stakes, blocking yield claims.
 *
 * Usage: npx hardhat run scripts/debug/fix-seeded-earnings.ts --network bscMainnet
 */

const TARGET_WALLET = "0xcce25f9953A8226722cD87c834fbB1A1E448a77F";
const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";

const ENGINE_ABI = [
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function seededEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function totalClaimed(address) view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("RESET SEEDED EARNINGS");
  console.log("=".repeat(60));
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Target:    ${TARGET_WALLET}`);
  console.log(`Engine:    ${ENGINE_ADDR}`);

  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, deployer);

  // 1. Read BEFORE state
  console.log("\n--- BEFORE ---");
  const seededBefore = await engine.seededEarnings(TARGET_WALLET);
  const claimableBefore = await engine.getClaimableYield(TARGET_WALLET);
  const accruedBefore = await engine.calculateAccruedYield(TARGET_WALLET);
  const claimedBefore = await engine.totalClaimed(TARGET_WALLET);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seededBefore, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimableBefore, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accruedBefore, 18)} USDT`);
  console.log(`  Total Claimed:    ${ethers.formatUnits(claimedBefore, 18)} USDT`);

  // 2. Execute adminSetSeededEarnings(target, 0)
  console.log("\n--- EXECUTING ---");
  console.log("  Sending tx: adminSetSeededEarnings(target, 0)...");
  const tx = await engine.adminSetSeededEarnings(TARGET_WALLET, 0);
  console.log(`  Tx hash: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log(`  ✅ Confirmed in block ${receipt?.blockNumber} (gas: ${receipt?.gasUsed})`);

  // 3. Read AFTER state
  console.log("\n--- AFTER ---");
  const seededAfter = await engine.seededEarnings(TARGET_WALLET);
  const claimableAfter = await engine.getClaimableYield(TARGET_WALLET);
  const accruedAfter = await engine.calculateAccruedYield(TARGET_WALLET);
  console.log(`  Seeded Earnings:  ${ethers.formatUnits(seededAfter, 18)} USDT`);
  console.log(`  Claimable Yield:  ${ethers.formatUnits(claimableAfter, 18)} USDT`);
  console.log(`  Accrued Yield:    ${ethers.formatUnits(accruedAfter, 18)} USDT`);

  // 4. Summary
  console.log("\n" + "=".repeat(60));
  if (claimableAfter > 0n) {
    console.log("✅ SUCCESS! Claimable yield is now > 0.");
    console.log(`   The user can now claim ${ethers.formatUnits(claimableAfter, 18)} USDT worth of OSLO.`);
  } else {
    console.log("⚠ Claimable yield is still 0. Check accrued yield —");
    console.log("  the user may need to wait for more yield to accrue.");
  }
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
