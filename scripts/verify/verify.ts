import { run } from "hardhat";
import * as fs from "fs";

async function main() {
  const network = await import("hardhat").then((h) => h.ethers.provider.getNetwork());
  const chainId = Number(network.chainId);
  
  const deploymentFile = `deployments-${chainId}.json`;
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const contracts = deployment.contracts;

  console.log("Verifying contracts on BSCScan...\n");

  // Verify OsloToken
  try {
    await run("verify:verify", {
      address: contracts.OsloToken,
      constructorArguments: [deployment.deployer],
    });
    console.log("OsloToken verified!");
  } catch (e: any) {
    console.log("OsloToken:", e.message);
  }

  // Verify OsloDEX
  try {
    await run("verify:verify", {
      address: contracts.OsloDEX,
      constructorArguments: [contracts.OsloToken, process.env.USDT_ADDRESS],
    });
    console.log("OsloDEX verified!");
  } catch (e: any) {
    console.log("OsloDEX:", e.message);
  }

  // Verify ReferralRegistry
  try {
    await run("verify:verify", {
      address: contracts.ReferralRegistry,
      constructorArguments: [],
    });
    console.log("ReferralRegistry verified!");
  } catch (e: any) {
    console.log("ReferralRegistry:", e.message);
  }

  // Verify RewardVault
  try {
    await run("verify:verify", {
      address: contracts.RewardVault,
      constructorArguments: [process.env.USDT_ADDRESS, contracts.OsloToken],
    });
    console.log("RewardVault verified!");
  } catch (e: any) {
    console.log("RewardVault:", e.message);
  }

  // Verify LevelIncomeSystem
  try {
    await run("verify:verify", {
      address: contracts.LevelIncomeSystem,
      constructorArguments: [contracts.ReferralRegistry, contracts.OsloDEX, contracts.OsloToken],
    });
    console.log("LevelIncomeSystem verified!");
  } catch (e: any) {
    console.log("LevelIncomeSystem:", e.message);
  }

  // Verify InvestmentEngine
  try {
    await run("verify:verify", {
      address: contracts.InvestmentEngine,
      constructorArguments: [
        process.env.USDT_ADDRESS,
        contracts.OsloToken,
        contracts.OsloDEX,
        contracts.RewardVault,
        contracts.ReferralRegistry,
        contracts.LevelIncomeSystem,
        process.env.COMPANY_WALLET,
        process.env.PERF_WALLET,
      ],
    });
    console.log("InvestmentEngine verified!");
  } catch (e: any) {
    console.log("InvestmentEngine:", e.message);
  }

  // Verify OsloDAO
  try {
    await run("verify:verify", {
      address: contracts.OsloDAO,
      constructorArguments: [process.env.USDT_ADDRESS, contracts.InvestmentEngine],
    });
    console.log("OsloDAO verified!");
  } catch (e: any) {
    console.log("OsloDAO:", e.message);
  }

  // Verify OsloTimelock
  try {
    await run("verify:verify", {
      address: contracts.OsloTimelock,
      constructorArguments: [86400, [deployment.deployer], [deployment.deployer], deployment.deployer],
    });
    console.log("OsloTimelock verified!");
  } catch (e: any) {
    console.log("OsloTimelock:", e.message);
  }

  console.log("\nVerification complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
