import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeploy OsloDEX (with fixed getPrice using actual balances) + InvestmentEngine.
 * Preserves all other contracts and their state.
 * Re-seeds DEX liquidity and re-wires all permissions.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying OsloDEX + InvestmentEngine with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Load existing addresses
  const deploymentInfo = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const contracts = deploymentInfo.contracts;

  console.log("\nExisting contracts:");
  console.log("  USDT:              ", contracts.MockUSDT);
  console.log("  OsloToken:         ", contracts.OsloToken);
  console.log("  Old OsloDEX:       ", contracts.OsloDEX);
  console.log("  Old Engine:        ", contracts.InvestmentEngine);
  console.log("  ReferralRegistry:  ", contracts.ReferralRegistry);
  console.log("  RewardVault:       ", contracts.RewardVault);
  console.log("  LevelIncomeSystem: ", contracts.LevelIncomeSystem);
  console.log("  OsloDAO:           ", contracts.OsloDAO);

  // Get contract instances
  const osloToken = await ethers.getContractAt("OsloToken", contracts.OsloToken);
  const usdt = await ethers.getContractAt("MockUSDT", contracts.MockUSDT);
  const vault = await ethers.getContractAt("RewardVault", contracts.RewardVault);
  const registry = await ethers.getContractAt("ReferralRegistry", contracts.ReferralRegistry);
  const levelSystem = await ethers.getContractAt("LevelIncomeSystem", contracts.LevelIncomeSystem);

  // ============================================================
  // 1. Deploy new OsloDEX
  // ============================================================
  console.log("\n1. Deploying new OsloDEX...");
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = await OsloDEX.deploy(contracts.OsloToken, contracts.MockUSDT);
  await osloDEX.waitForDeployment();
  const newDexAddress = await osloDEX.getAddress();
  console.log("   New OsloDEX deployed to:", newDexAddress);

  // ============================================================
  // 2. Grant BURNER_ROLE on OsloToken to new DEX
  // ============================================================
  console.log("\n2. Wiring DEX permissions...");
  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  await osloToken.grantRole(BURNER_ROLE, newDexAddress);
  console.log("   Granted BURNER_ROLE on OsloToken to new DEX");

  // ============================================================
  // 3. Transfer OSLO tokens to new DEX for liquidity
  // ============================================================
  console.log("\n3. Transferring OSLO tokens to new DEX...");
  const dexOsloReserve = ethers.parseEther("100000"); // 100K OSLO

  // Check if deployer has enough OSLO; if not, release from RewardVault
  const deployerOsloBal = await osloToken.balanceOf(deployer.address);
  if (deployerOsloBal < dexOsloReserve) {
    console.log("   Deployer has insufficient OSLO, releasing from RewardVault...");
    const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
    // Grant ENGINE_ROLE to deployer on vault (deployer is DEFAULT_ADMIN)
    await vault.grantRole(ENGINE_ROLE, deployer.address);
    console.log("   Granted ENGINE_ROLE to deployer on RewardVault");
    // Release OSLO directly to the new DEX
    await vault.releaseOSLO(newDexAddress, dexOsloReserve);
    console.log("   Released 100K OSLO from RewardVault to new DEX");
  } else {
    await osloToken.transfer(newDexAddress, dexOsloReserve);
    console.log("   Transferred 100K OSLO to new DEX");
  }

  // ============================================================
  // 4. Mint USDT to new DEX and seed liquidity
  // ============================================================
  console.log("\n4. Seeding DEX liquidity...");
  const dexUsdtReserve = ethers.parseUnits("2000", 6); // 2000 USDT
  await usdt.mint(newDexAddress, dexUsdtReserve);
  await osloDEX.seedLiquidity(dexUsdtReserve, dexOsloReserve);
  console.log("   Seeded DEX: 2000 USDT + 100K OSLO");

  // Verify price
  const price = await osloDEX.getPrice();
  console.log("   Initial OSLO price:", ethers.formatEther(price), "USDT");

  // ============================================================
  // 5. Deploy new InvestmentEngine (with new DEX address)
  // ============================================================
  console.log("\n5. Deploying new InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    contracts.MockUSDT,
    contracts.OsloToken,
    newDexAddress, // <-- new DEX address
    contracts.RewardVault,
    contracts.ReferralRegistry,
    contracts.LevelIncomeSystem,
    deployer.address, // company wallet
    deployer.address  // perf wallet
  );
  await engine.waitForDeployment();
  const newEngineAddress = await engine.getAddress();
  console.log("   New InvestmentEngine deployed to:", newEngineAddress);

  // ============================================================
  // 6. Wire all permissions for new engine
  // ============================================================
  console.log("\n6. Wiring engine permissions...");
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  await osloToken.grantRole(BURNER_ROLE, newEngineAddress);
  console.log("   Granted BURNER_ROLE on OsloToken to new engine");

  await vault.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on RewardVault to new engine");

  await registry.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on ReferralRegistry to new engine");

  await levelSystem.grantRole(ENGINE_ROLE, newEngineAddress);
  console.log("   Granted ENGINE_ROLE on LevelIncomeSystem to new engine");

  await engine.grantRole(LEVEL_SYSTEM_ROLE, contracts.LevelIncomeSystem);
  console.log("   Granted LEVEL_SYSTEM_ROLE on new engine to LevelIncomeSystem");

  await levelSystem.setInvestmentEngine(newEngineAddress);
  console.log("   Updated LevelIncomeSystem.investmentEngine to new engine");

  // ============================================================
  // 7. Update deployment files
  // ============================================================
  console.log("\n7. Updating deployment files...");

  deploymentInfo.contracts.OsloDEX = newDexAddress;
  deploymentInfo.contracts.InvestmentEngine = newEngineAddress;
  deploymentInfo.timestamp = new Date().toISOString();
  fs.writeFileSync("deployments-97.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("   Updated deployments-97.json");

  // Update frontend/.env.local
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_OSLO_DEX_ADDRESS=.*/,
    `NEXT_PUBLIC_OSLO_DEX_ADDRESS=${newDexAddress}`
  );
  envContent = envContent.replace(
    /NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/,
    `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${newEngineAddress}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log("   Updated frontend/.env.local");

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n========================================");
  console.log("OSLO DEX + ENGINE REDEPLOYED SUCCESSFULLY");
  console.log("========================================");
  console.log("Old DEX:   ", contracts.OsloDEX);
  console.log("New DEX:   ", newDexAddress);
  console.log("Old Engine:", contracts.InvestmentEngine);
  console.log("New Engine:", newEngineAddress);
  console.log("========================================");
  console.log("\nOSLO Price now uses ACTUAL token balances:");
  console.log("  Price = usdt.balanceOf(DEX) / osloToken.balanceOf(DEX)");
  console.log("  This includes registration fees + staking deposits + sell taxes.");
  console.log("\nNOTE: Existing stakes on the old engine are NOT migrated.");
  console.log("Users will need to stake again on the new engine.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
