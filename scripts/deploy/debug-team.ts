import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const DEBUG_WALLET = "0xbd632973e1353210D9f0b40461d8B876628F1E02";

  const deployment = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const addresses = deployment.contracts;

  const usdtFactory = await ethers.getContractFactory("MockUSDT");
  const engineFactory = await ethers.getContractFactory("InvestmentEngine");
  const registryFactory = await ethers.getContractFactory("ReferralRegistry");

  const usdt = usdtFactory.attach(addresses.MockUSDT) as any;
  const engine = engineFactory.attach(addresses.InvestmentEngine) as any;
  const registry = registryFactory.attach(addresses.ReferralRegistry) as any;

  console.log("Registry:", addresses.ReferralRegistry);
  console.log("Engine:", addresses.InvestmentEngine);
  console.log("Debug wallet:", DEBUG_WALLET);

  // 1. Get direct downlines
  const downlines = await registry.getDirectDownlines(DEBUG_WALLET);
  console.log("\nDirect downlines:", downlines);

  // 2. For each downline, check stakes
  let totalVolume = 0n;
  for (let i = 0; i < downlines.length; i++) {
    const downline = downlines[i];
    const stakes = await engine.getUserStakes(downline);
    console.log(`\nDownline ${i + 1}: ${downline}`);
    console.log(`  Stakes count: ${stakes.length}`);
    for (let j = 0; j < stakes.length; j++) {
      console.log(`  Stake ${j}: active=${ethers.formatUnits(stakes[j].activeStake, 6)} USDT, tier=${stakes[j].tier}, isActive=${stakes[j].isActive}`);
      totalVolume += stakes[j].activeStake;
    }
  }
  console.log("\nManual total volume:", ethers.formatUnits(totalVolume, 6), "USDT");

  // 3. Call getTeamVolume
  const contractVolume = await engine.getTeamVolume(DEBUG_WALLET);
  console.log("Contract getTeamVolume:", ethers.formatUnits(contractVolume, 6), "USDT");

  // 4. Check if engine's referralRegistry matches
  const engineRegistry = await engine.referralRegistry();
  console.log("\nEngine's referralRegistry:", engineRegistry);
  console.log("Expected registry:", addresses.ReferralRegistry);
  console.log("Match:", engineRegistry.toLowerCase() === addresses.ReferralRegistry.toLowerCase());
}

main().catch(console.error);
