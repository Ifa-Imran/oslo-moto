import { ethers } from "hardhat";

/**
 * Set reward wallets on mainnet InvestmentEngine.
 * Admin is still open (completeSetup was NOT called).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const IE_ADDR = "0x4d27A6564BE18fF57f4484aCBd8F5bCc9caB2E80";

  const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";      // 1.0%
  const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";     // 0.5%
  const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9"; // 0.5%

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);

  // Check current state
  const currentReward = await ie.rewardWallet();
  const currentCompany = await ie.companyWallet();
  const currentPerformance = await ie.performanceWallet();
  console.log("\nCurrent reward wallets:");
  console.log("  rewardWallet:", currentReward);
  console.log("  companyWallet:", currentCompany);
  console.log("  performanceWallet:", currentPerformance);

  if (currentReward !== ethers.ZeroAddress) {
    console.log("\n✅ Reward wallets already set. Nothing to do.");
    return;
  }

  console.log("\n⚙️  Setting reward wallets...");
  const tx = await ie.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET, {
    gasPrice: ethers.parseUnits("1", "gwei"),
  });
  console.log("  tx:", tx.hash);
  await tx.wait();

  console.log("\n✅ Reward wallets set:");
  console.log("  Reward (1.0%):", REWARD_WALLET);
  console.log("  Company (0.5%):", COMPANY_WALLET);
  console.log("  Performance (0.5%):", PERFORMANCE_WALLET);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
