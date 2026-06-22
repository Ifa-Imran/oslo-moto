import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeploy ONLY the InvestmentEngine with the per-second yield fix.
 * Preserves all other contracts and their state.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying InvestmentEngine with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Load existing addresses from deployments-97.json
  const deploymentInfo = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const contracts = deploymentInfo.contracts;

  console.log("\nExisting contracts:");
  console.log("  USDT:             ", contracts.MockUSDT);
  console.log("  OsloToken:        ", contracts.OsloToken);
  console.log("  OsloDEX:          ", contracts.OsloDEX);
  console.log("  ReferralRegistry: ", contracts.ReferralRegistry);
  console.log("  RewardVault:      ", contracts.RewardVault);
  console.log("  LevelIncomeSystem:", contracts.LevelIncomeSystem);
  console.log("  Old Engine:       ", contracts.InvestmentEngine);
  console.log("  OsloDAO:          ", contracts.OsloDAO);

  // 1. Deploy new InvestmentEngine
  console.log("\n1. Deploying new InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    contracts.MockUSDT,
    contracts.OsloToken,
    contracts.OsloDEX,
    contracts.RewardVault,
    contracts.ReferralRegistry,
    contracts.LevelIncomeSystem,
    deployer.address, // company wallet
    deployer.address  // perf wallet
  );
  await engine.waitForDeployment();
  const newEngineAddress = await engine.getAddress();
  console.log("   New InvestmentEngine deployed to:", newEngineAddress);

  // 2. Wire permissions
  console.log("\n2. Wiring permissions...");

  // Get contract instances
  const osloToken = await ethers.getContractAt("OsloToken", contracts.OsloToken);
  const vault = await ethers.getContractAt("RewardVault", contracts.RewardVault);
  const registry = await ethers.getContractAt("ReferralRegistry", contracts.ReferralRegistry);
  const levelSystem = await ethers.getContractAt("LevelIncomeSystem", contracts.LevelIncomeSystem);

  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  // Grant BURNER_ROLE on OsloToken to new engine
  await osloToken.grantRole(BURNER_ROLE, newEngineAddress);
  console.log("   Granted BURNER_ROLE on OsloToken to new engine");

  // Grant ENGINE_ROLE on RewardVault to new engine
  await vault.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on RewardVault to new engine");

  // Grant ENGINE_ROLE on ReferralRegistry to new engine
  await registry.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on ReferralRegistry to new engine");

  // Grant ENGINE_ROLE on LevelIncomeSystem to new engine
  await levelSystem.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on LevelIncomeSystem to new engine");

  // Grant LEVEL_SYSTEM_ROLE on new engine to LevelIncomeSystem
  await engine.grantRole(LEVEL_SYSTEM_ROLE, contracts.LevelIncomeSystem);
  console.log("   Granted LEVEL_SYSTEM_ROLE on new engine to LevelIncomeSystem");

  // Update LevelIncomeSystem to point to new engine
  await levelSystem.setInvestmentEngine(newEngineAddress);
  console.log("   Updated LevelIncomeSystem.investmentEngine to new engine");

  // 3. Update deployment files
  console.log("\n3. Updating deployment files...");

  // Update deployments-97.json
  deploymentInfo.contracts.InvestmentEngine = newEngineAddress;
  deploymentInfo.timestamp = new Date().toISOString();
  fs.writeFileSync("deployments-97.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("   Updated deployments-97.json");

  // Update frontend/.env.local
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/,
    `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${newEngineAddress}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log("   Updated frontend/.env.local");

  // Summary
  console.log("\n========================================");
  console.log("INVESTMENT ENGINE REDEPLOYED SUCCESSFULLY");
  console.log("========================================");
  console.log("Old Engine:", contracts.InvestmentEngine);
  console.log("New Engine:", newEngineAddress);
  console.log("========================================");
  console.log("\nYield now accrues PER SECOND (continuously).");
  console.log("Frontend polls every 10 seconds for yield updates.");
  console.log("\nNOTE: Existing stakes on the old engine are NOT migrated.");
  console.log("Users will need to stake again on the new engine.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
