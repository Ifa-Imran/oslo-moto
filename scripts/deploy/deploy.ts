import { ethers } from "hardhat";

// BSC Mainnet USDT: 0x55d398326f99059fF775485246999027B3197955
// BSC Testnet USDT (mock): Deploy your own or use existing test token

const USDT_MAINNET = "0x55d398326f99059fF775485246999027B3197955";
const COMPANY_WALLET = process.env.COMPANY_WALLET || "";
const PERF_WALLET = process.env.PERF_WALLET || "";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const USDT_ADDRESS = process.env.USDT_ADDRESS || USDT_MAINNET;
  const companyWallet = COMPANY_WALLET || deployer.address;
  const perfWallet = PERF_WALLET || deployer.address;

  // 1. Deploy OSLO Token
  console.log("\n1. Deploying OsloToken...");
  const OsloToken = await ethers.getContractFactory("OsloToken");
  const osloToken = await OsloToken.deploy(deployer.address);
  await osloToken.waitForDeployment();
  const osloTokenAddress = await osloToken.getAddress();
  console.log("   OsloToken deployed to:", osloTokenAddress);

  // 2. Deploy OsloDEX
  console.log("\n2. Deploying OsloDEX...");
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = await OsloDEX.deploy(osloTokenAddress, USDT_ADDRESS);
  await osloDEX.waitForDeployment();
  const osloDEXAddress = await osloDEX.getAddress();
  console.log("   OsloDEX deployed to:", osloDEXAddress);

  // 3. Deploy ReferralRegistry
  console.log("\n3. Deploying ReferralRegistry...");
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = await ReferralRegistry.deploy(USDT_ADDRESS, osloDEXAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   ReferralRegistry deployed to:", registryAddress);

  // 4. Deploy RewardVault
  console.log("\n4. Deploying RewardVault...");
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const vault = await RewardVault.deploy(USDT_ADDRESS, osloTokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("   RewardVault deployed to:", vaultAddress);

  // 5. Deploy LevelIncomeSystem
  console.log("\n5. Deploying LevelIncomeSystem...");
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(registryAddress, osloDEXAddress, osloTokenAddress);
  await levelSystem.waitForDeployment();
  const levelSystemAddress = await levelSystem.getAddress();
  console.log("   LevelIncomeSystem deployed to:", levelSystemAddress);

  // 6. Deploy InvestmentEngine
  console.log("\n6. Deploying InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    USDT_ADDRESS,
    osloTokenAddress,
    osloDEXAddress,
    vaultAddress,
    registryAddress,
    levelSystemAddress,
    companyWallet,
    perfWallet
  );
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("   InvestmentEngine deployed to:", engineAddress);

  // 7. Deploy OsloDAO
  console.log("\n7. Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(USDT_ADDRESS, engineAddress);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("   OsloDAO deployed to:", daoAddress);

  // 8. Deploy Timelock (24-hour delay)
  console.log("\n8. Deploying OsloTimelock...");
  const OsloTimelock = await ethers.getContractFactory("OsloTimelock");
  const timelock = await OsloTimelock.deploy(
    86400, // 24 hours
    [deployer.address],
    [deployer.address],
    deployer.address
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("   OsloTimelock deployed to:", timelockAddress);

  // 9. Wire permissions
  console.log("\n9. Wiring permissions...");
  
  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  // Grant BURNER_ROLE to DEX and Engine
  await osloToken.grantRole(BURNER_ROLE, osloDEXAddress);
  console.log("   Granted BURNER_ROLE to OsloDEX");
  await osloToken.grantRole(BURNER_ROLE, engineAddress);
  console.log("   Granted BURNER_ROLE to InvestmentEngine");

  // Grant ENGINE_ROLE to InvestmentEngine on RewardVault
  await vault.grantRole(ENGINE_ROLE, engineAddress);
  console.log("   Granted ENGINE_ROLE to InvestmentEngine on RewardVault");

  // Grant ENGINE_ROLE to InvestmentEngine on ReferralRegistry
  await registry.grantRole(ENGINE_ROLE, engineAddress);
  console.log("   Granted ENGINE_ROLE to InvestmentEngine on ReferralRegistry");

  // Grant ENGINE_ROLE to InvestmentEngine on LevelIncomeSystem
  await levelSystem.grantRole(ENGINE_ROLE, engineAddress);
  console.log("   Granted ENGINE_ROLE to InvestmentEngine on LevelIncomeSystem");

  // Grant LEVEL_SYSTEM_ROLE to LevelIncomeSystem on InvestmentEngine
  await engine.grantRole(LEVEL_SYSTEM_ROLE, levelSystemAddress);
  console.log("   Granted LEVEL_SYSTEM_ROLE to LevelIncomeSystem on InvestmentEngine");

  // Set InvestmentEngine on LevelIncomeSystem
  await levelSystem.setInvestmentEngine(engineAddress);
  console.log("   Set InvestmentEngine on LevelIncomeSystem");

  // Set ReferralRegistry on OsloDAO
  await dao.setReferralRegistry(registryAddress);
  console.log("   Set ReferralRegistry on OsloDAO");

  // 10. Transfer token reserves
  console.log("\n10. Transferring token reserves...");
  
  // Transfer 11M OSLO to RewardVault (for yield distribution)
  const engineReserve = ethers.parseEther("11000000");
  await osloToken.transfer(vaultAddress, engineReserve);
  console.log("   Transferred 11M OSLO to RewardVault");

  // Transfer 100K OSLO to DEX
  const dexReserve = ethers.parseEther("100000");
  await osloToken.transfer(osloDEXAddress, dexReserve);
  console.log("   Transferred 100K OSLO to OsloDEX");

  // Seed DEX reserves tracking
  await osloDEX.seedLiquidity(ethers.parseUnits("2000", 6), dexReserve);
  console.log("   Seeded DEX liquidity (2000 USDT + 100K OSLO reserves)");

  // 11. Summary
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("OsloToken:        ", osloTokenAddress);
  console.log("OsloDEX:          ", osloDEXAddress);
  console.log("ReferralRegistry: ", registryAddress);
  console.log("RewardVault:      ", vaultAddress);
  console.log("LevelIncomeSystem:", levelSystemAddress);
  console.log("InvestmentEngine: ", engineAddress);
  console.log("OsloDAO:          ", daoAddress);
  console.log("OsloTimelock:     ", timelockAddress);
  console.log("========================================");

  // Save deployment addresses
  const fs = require("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    contracts: {
      OsloToken: osloTokenAddress,
      OsloDEX: osloDEXAddress,
      ReferralRegistry: registryAddress,
      RewardVault: vaultAddress,
      LevelIncomeSystem: levelSystemAddress,
      InvestmentEngine: engineAddress,
      OsloDAO: daoAddress,
      OsloTimelock: timelockAddress,
    },
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    `deployments-${deploymentInfo.chainId}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\nDeployment info saved to deployments-${deploymentInfo.chainId}.json`);

  // Also generate frontend .env.local
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo-project-id";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const envContent = `NEXT_PUBLIC_WC_PROJECT_ID=${wcProjectId}
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_CHAIN_ID=${deploymentInfo.chainId}
NEXT_PUBLIC_USDT_ADDRESS=${USDT_ADDRESS}
NEXT_PUBLIC_OSLO_TOKEN_ADDRESS=${osloTokenAddress}
NEXT_PUBLIC_OSLO_DEX_ADDRESS=${osloDEXAddress}
NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${engineAddress}
NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS=${registryAddress}
NEXT_PUBLIC_REWARD_VAULT_ADDRESS=${vaultAddress}
NEXT_PUBLIC_OSLO_DAO_ADDRESS=${daoAddress}
`;
  fs.writeFileSync("frontend/.env.local", envContent);
  console.log("Frontend .env.local generated!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
