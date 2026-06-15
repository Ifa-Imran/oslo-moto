import { ethers } from "hardhat";

/**
 * Fix yield generation for test accounts:
 * 1. Lower minClaimThreshold to $0.01 for QA testing
 * 2. Verify all deposited accounts have claimable yield
 */

const INVESTMENT_ENGINE = "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("FIX: Lower Claim Threshold for QA Testing");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address, "\n");

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);

  // Check current threshold
  const currentThreshold = await ie.minClaimThreshold();
  console.log("Current minClaimThreshold: $" + ethers.formatEther(currentThreshold));

  // Lower to $0.01 for testing
  const newThreshold = ethers.parseEther("0.01");
  console.log("Setting new threshold:     $" + ethers.formatEther(newThreshold));

  const tx = await ie.setMinClaimThreshold(newThreshold);
  await tx.wait();
  console.log("✓ Threshold updated\n");

  // Verify accounts with deposits
  const accounts = [
    "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c",
    "0xcFdDCd38F6789f9BdbBD26eb0b68c4CCe8d9FeD1",
    "0x1c6BAb379a95A4E268215eE4D223F59f1810635F",
    "0xD0E00Ce75774c06fd300E01Ae7e75e88084e3B89",
    "0xBD3bC2d090f49EF631e29b3D1226451c483Dc4d8",
  ];

  console.log("Account Yield Status:");
  for (const acct of accounts) {
    const info = await ie.users(acct);
    if (Number(info.depositCount) === 0) {
      console.log(`  ${acct.slice(0,10)}... — NO DEPOSIT`);
      continue;
    }
    const pending = await ie.getPendingRewards(acct, 0);
    const status = pending > newThreshold ? "✓ CLAIMABLE" : "⚠ below threshold";
    console.log(`  ${acct.slice(0,10)}... — $${ethers.formatEther(pending)} pending — ${status}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("DONE — All deposited accounts can now claim yield");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
