import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Continuation script: new DEX already deployed at 0xa2e54E427A148a9C8d0120943B808A9754ae037E
 * Need to: release OSLO from vault → seed liquidity → deploy engine → wire → update files
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Continuing DEX+Engine redeploy with:", deployer.address);

  const deploymentInfo = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const contracts = deploymentInfo.contracts;

  const newDexAddress = "0xa2e54E427A148a9C8d0120943B808A9754ae037E";

  // Get contract instances
  const osloToken = await ethers.getContractAt("OsloToken", contracts.OsloToken);
  const usdt = await ethers.getContractAt("MockUSDT", contracts.MockUSDT);
  const vault = await ethers.getContractAt("RewardVault", contracts.RewardVault);
  const registry = await ethers.getContractAt("ReferralRegistry", contracts.ReferralRegistry);
  const levelSystem = await ethers.getContractAt("LevelIncomeSystem", contracts.LevelIncomeSystem);
  const osloDEX = await ethers.getContractAt("OsloDEX", newDexAddress);

  // Verify new DEX is deployed
  const dexOsloBal = await osloToken.balanceOf(newDexAddress);
  console.log("New DEX OSLO balance:", ethers.formatEther(dexOsloBal));

  // ============================================================
  // 1. Release OSLO from RewardVault to new DEX
  // ============================================================
  if (dexOsloBal === 0n) {
    console.log("\n1. Releasing 100K OSLO from RewardVault to new DEX...");
    const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
    await vault.grantRole(ENGINE_ROLE, deployer.address);
    console.log("   Granted ENGINE_ROLE to deployer on vault");
    await vault.releaseOSLO(newDexAddress, ethers.parseEther("100000"));
    console.log("   Released 100K OSLO to new DEX");
  } else {
    console.log("\n1. DEX already has OSLO, skipping release");
  }

  // ============================================================
  // 2. Mint USDT and seed liquidity
  // ============================================================
  const dexUsdtBal = await usdt.balanceOf(newDexAddress);
  if (dexUsdtBal === 0n) {
    console.log("\n2. Minting USDT and seeding liquidity...");
    await usdt.mint(newDexAddress, ethers.parseUnits("2000", 6));
    await osloDEX.seedLiquidity(ethers.parseUnits("2000", 6), ethers.parseEther("100000"));
    console.log("   Seeded DEX: 2000 USDT + 100K OSLO");
  } else {
    console.log("\n2. DEX already has USDT, skipping seed");
  }

  // Verify price
  const price = await osloDEX.getPrice();
  console.log("   OSLO price:", ethers.formatEther(price), "USDT");

  // ============================================================
  // 3. Deploy new InvestmentEngine
  // ============================================================
  console.log("\n3. Deploying new InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    contracts.MockUSDT,
    contracts.OsloToken,
    newDexAddress,
    contracts.RewardVault,
    contracts.ReferralRegistry,
    contracts.LevelIncomeSystem,
    deployer.address,
    deployer.address
  );
  await engine.waitForDeployment();
  const newEngineAddress = await engine.getAddress();
  console.log("   New InvestmentEngine deployed to:", newEngineAddress);

  // ============================================================
  // 4. Wire all permissions
  // ============================================================
  console.log("\n4. Wiring permissions...");
  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  await osloToken.grantRole(BURNER_ROLE, newEngineAddress);
  console.log("   BURNER_ROLE on OsloToken → new engine");

  await vault.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   ENGINE_ROLE on RewardVault → new engine");

  await registry.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   ENGINE_ROLE on ReferralRegistry → new engine");

  await levelSystem.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   ENGINE_ROLE on LevelIncomeSystem → new engine");

  await engine.grantRole(LEVEL_SYSTEM_ROLE, contracts.LevelIncomeSystem);
  console.log("   LEVEL_SYSTEM_ROLE on new engine → LevelIncomeSystem");

  await levelSystem.setInvestmentEngine(newEngineAddress);
  console.log("   LevelIncomeSystem.investmentEngine → new engine");

  // ============================================================
  // 5. Update deployment files
  // ============================================================
  console.log("\n5. Updating deployment files...");
  deploymentInfo.contracts.OsloDEX = newDexAddress;
  deploymentInfo.contracts.InvestmentEngine = newEngineAddress;
  deploymentInfo.timestamp = new Date().toISOString();
  fs.writeFileSync("deployments-97.json", JSON.stringify(deploymentInfo, null, 2));

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(/NEXT_PUBLIC_OSLO_DEX_ADDRESS=.*/, `NEXT_PUBLIC_OSLO_DEX_ADDRESS=${newDexAddress}`);
  envContent = envContent.replace(/NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/, `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${newEngineAddress}`);
  fs.writeFileSync(envPath, envContent);

  console.log("\n========================================");
  console.log("DEX + ENGINE REDEPLOY COMPLETE");
  console.log("========================================");
  console.log("New DEX:   ", newDexAddress);
  console.log("New Engine:", newEngineAddress);
  console.log("OSLO Price:", ethers.formatEther(price), "USDT");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
