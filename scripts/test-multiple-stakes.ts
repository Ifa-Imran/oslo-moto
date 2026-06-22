import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Read deployment info
  const deploymentInfo = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const {
    MockUSDT: usdtAddress,
    InvestmentEngine: engineAddress,
  } = deploymentInfo.contracts;

  const usdt = await ethers.getContractAt("MockUSDT", usdtAddress);
  const engine = await ethers.getContractAt("InvestmentEngine", engineAddress);

  // Approve USDT
  const stakeAmount1 = ethers.parseUnits("100", 6);
  const stakeAmount2 = ethers.parseUnits("150", 6);

  console.log("Approving USDT...");
  await (await usdt.approve(engineAddress, stakeAmount1 + stakeAmount2)).wait();

  // First stake
  console.log("Staking first amount:", ethers.formatUnits(stakeAmount1, 6), "USDT");
  const tx1 = await engine.stake(stakeAmount1, 1, ethers.ZeroAddress);
  await tx1.wait();
  console.log("First stake successful!");

  // Second stake
  console.log("Staking second amount:", ethers.formatUnits(stakeAmount2, 6), "USDT");
  const tx2 = await engine.stake(stakeAmount2, 1, ethers.ZeroAddress);
  await tx2.wait();
  console.log("Second stake successful!");

  // Check stakes
  const stakes = await engine.getUserStakes(deployer.address);
  console.log("Number of stakes:", stakes.length);
  for (let i = 0; i < stakes.length; i++) {
    console.log(`Stake ${i + 1}:`, {
      activeStake: ethers.formatUnits(stakes[i].activeStake, 6),
      tier: stakes[i].tier,
      isActive: stakes[i].isActive,
    });
  }

  const aggregate = await engine.getUserStake(deployer.address);
  console.log("Aggregate active stake:", ethers.formatUnits(aggregate.activeStake, 6));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
