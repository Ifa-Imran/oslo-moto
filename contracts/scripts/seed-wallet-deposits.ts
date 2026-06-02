import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed deposits for wallet 0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8
 * These were marked inactive on mainnet but user confirms they should be active.
 * Using migrateDeposits() to inject them as active on testnet.
 */
async function main() {
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "testnet-addresses.json"), "utf-8")
  );

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", addresses.OSLOInvestmentEngine);

  const wallet = "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8";

  // Check current state
  const currentCount = await ie.getDepositCount(wallet);
  console.log(`Current deposit count for ${wallet}: ${currentCount}`);

  if (Number(currentCount) > 0) {
    console.log("Deposits already exist! Skipping to avoid duplicates.");
    return;
  }

  // 4 deposits from mainnet (marking as active)
  const deposits = [
    {
      owner: wallet,
      amount: ethers.parseEther("10"),
      tier: 1,
      dailyRate: 50,
      depositTime: 1779815912,
      lastClaimTime: 1779815912,
      totalClaimed: 0,
      maxReturn: ethers.parseEther("30"),
    },
    {
      owner: wallet,
      amount: ethers.parseEther("30"),
      tier: 1,
      dailyRate: 52,
      depositTime: 1779850423,
      lastClaimTime: 1779850423,
      totalClaimed: 0,
      maxReturn: ethers.parseEther("90"),
    },
    {
      owner: wallet,
      amount: ethers.parseEther("26"),
      tier: 1,
      dailyRate: 51,
      depositTime: 1779887979,
      lastClaimTime: 1779887979,
      totalClaimed: 0,
      maxReturn: ethers.parseEther("78"),
    },
    {
      owner: wallet,
      amount: ethers.parseEther("35"),
      tier: 1,
      dailyRate: 52,
      depositTime: 1779931481,
      lastClaimTime: 1779931481,
      totalClaimed: 0,
      maxReturn: ethers.parseEther("105"),
    },
  ];

  console.log(`\nSeeding ${deposits.length} deposits for ${wallet}...`);

  const tx = await ie.migrateDeposits(deposits);
  console.log(`TX sent: ${tx.hash}`);
  await tx.wait();
  console.log("TX confirmed!");

  // Verify
  const newCount = await ie.getDepositCount(wallet);
  const activeDeposit = await ie.getActiveDeposit(wallet);
  console.log(`\n=== VERIFIED ===`);
  console.log(`depositCount: ${Number(newCount)}`);
  console.log(`getActiveDeposit: ${ethers.formatEther(activeDeposit)} USDT`);
  console.log(`Expected: 101.0 USDT (10 + 30 + 26 + 35)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
