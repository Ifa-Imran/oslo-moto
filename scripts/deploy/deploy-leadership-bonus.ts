import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Deploy LeadershipBonus + Redeploy InvestmentEngine (with OSLO formula fix + leadershipBonus integration).
 * Preserves all other contracts and their state.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Load existing addresses
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

  // ─── 1. Deploy new LevelIncomeSystem (with OSLO formula fix) ───
  console.log("\n1. Deploying new LevelIncomeSystem (with OSLO formula fix)...");
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(
    contracts.ReferralRegistry,
    contracts.OsloDEX,
    contracts.OsloToken
  );
  await levelSystem.waitForDeployment();
  const newLevelSystemAddress = await levelSystem.getAddress();
  console.log("   New LevelIncomeSystem deployed to:", newLevelSystemAddress);

  // ─── 2. Deploy new InvestmentEngine (with OSLO formula fix + leadershipBonus integration) ───
  console.log("\n2. Deploying new InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    contracts.MockUSDT,
    contracts.OsloToken,
    contracts.OsloDEX,
    contracts.RewardVault,
    contracts.ReferralRegistry,
    newLevelSystemAddress, // use NEW level system
    deployer.address, // company wallet
    deployer.address  // perf wallet
  );
  await engine.waitForDeployment();
  const newEngineAddress = await engine.getAddress();
  console.log("   New InvestmentEngine deployed to:", newEngineAddress);

  // ─── 3. Deploy LeadershipBonus ───
  console.log("\n3. Deploying LeadershipBonus...");
  const LeadershipBonus = await ethers.getContractFactory("LeadershipBonus");
  const leadershipBonus = await LeadershipBonus.deploy(
    contracts.ReferralRegistry,
    contracts.OsloDEX,
    contracts.OsloToken,
    contracts.RewardVault
  );
  await leadershipBonus.waitForDeployment();
  const lbAddress = await leadershipBonus.getAddress();
  console.log("   LeadershipBonus deployed to:", lbAddress);

  // ─── 4. Fund new LevelIncomeSystem with OSLO from vault ───
  console.log("\n4. Funding LevelIncomeSystem with OSLO from vault...");
  const osloToken = await ethers.getContractAt("OsloToken", contracts.OsloToken);
  const vault = await ethers.getContractAt("RewardVault", contracts.RewardVault);
  const registry = await ethers.getContractAt("ReferralRegistry", contracts.ReferralRegistry);

  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

  // Temporarily grant ENGINE_ROLE to deployer to release OSLO
  await vault.grantRole(ENGINE_ROLE, deployer.address);
  console.log("   Temporarily granted ENGINE_ROLE on vault to deployer");
  // Release 500K OSLO to LevelIncomeSystem for commission payouts
  const FUND_AMOUNT = ethers.parseEther("500000");
  await vault.releaseOSLO(newLevelSystemAddress, FUND_AMOUNT);
  console.log("   Released 500K OSLO to new LevelIncomeSystem");

  // ─── 5. Wire permissions ───
  console.log("\n5. Wiring permissions...");

  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  // Engine permissions
  console.log("   -- Engine permissions --");
  await osloToken.grantRole(BURNER_ROLE, newEngineAddress);
  console.log("   Granted BURNER_ROLE on OsloToken to new engine");
  await vault.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on RewardVault to new engine");
  await registry.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on ReferralRegistry to new engine");
  await levelSystem.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on LevelIncomeSystem to new engine");
  await engine.grantRole(LEVEL_SYSTEM_ROLE, newLevelSystemAddress);
  console.log("   Granted LEVEL_SYSTEM_ROLE on engine to LevelIncomeSystem");
  await levelSystem.setInvestmentEngine(newEngineAddress);
  console.log("   Updated LevelIncomeSystem.investmentEngine to new engine");

  // LeadershipBonus permissions
  console.log("   -- LeadershipBonus permissions --");
  await vault.grantRole(ENGINE_ROLE, lbAddress);
  console.log("   Granted ENGINE_ROLE on RewardVault to LeadershipBonus");
  await leadershipBonus.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on LeadershipBonus to engine");
  await engine.grantRole(LEVEL_SYSTEM_ROLE, lbAddress);
  console.log("   Granted LEVEL_SYSTEM_ROLE on engine to LeadershipBonus");

  // Link engine <-> leadershipBonus
  await engine.setLeadershipBonus(lbAddress);
  console.log("   Set engine.leadershipBonus =", lbAddress);
  await leadershipBonus.setInvestmentEngine(newEngineAddress);
  console.log("   Set leadershipBonus.investmentEngine =", newEngineAddress);

  // ─── 6. Update deployment files ───
  console.log("\n6. Updating deployment files...");

  deploymentInfo.contracts.LevelIncomeSystem = newLevelSystemAddress;
  deploymentInfo.contracts.InvestmentEngine = newEngineAddress;
  deploymentInfo.contracts.LeadershipBonus = lbAddress;
  deploymentInfo.timestamp = new Date().toISOString();
  fs.writeFileSync("deployments-97.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("   Updated deployments-97.json");

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/,
    `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${newEngineAddress}`
  );
  if (envContent.includes("NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=")) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=.*/,
      `NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=${lbAddress}`
    );
  } else {
    envContent += `NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=${lbAddress}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("   Updated frontend/.env.local");

  // ─── Summary ───
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("LevelIncomeSystem:", newLevelSystemAddress);
  console.log("InvestmentEngine: ", newEngineAddress);
  console.log("LeadershipBonus:  ", lbAddress);
  console.log("========================================");
  console.log("\nChanges:");
  console.log("  - OSLO conversion formula fixed in all 3 contracts (removed erroneous *1e12)");
  console.log("  - LeadershipBonus integrated into stake flow");
  console.log("  - LevelIncomeSystem funded with 500K OSLO for commission payouts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
