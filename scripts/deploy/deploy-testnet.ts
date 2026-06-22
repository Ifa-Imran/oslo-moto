import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Deploy script for local Hardhat testnet - includes MockUSDT deployment
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // 1. Deploy MockUSDT (testnet only)
  console.log("\n1. Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("   MockUSDT deployed to:", usdtAddress);

  // 2. Deploy OSLO Token
  console.log("\n2. Deploying OsloToken...");
  const OsloToken = await ethers.getContractFactory("OsloToken");
  const osloToken = await OsloToken.deploy(deployer.address);
  await osloToken.waitForDeployment();
  const osloTokenAddress = await osloToken.getAddress();
  console.log("   OsloToken deployed to:", osloTokenAddress);

  // 3. Deploy OsloDEX
  console.log("\n3. Deploying OsloDEX...");
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = await OsloDEX.deploy(osloTokenAddress, usdtAddress);
  await osloDEX.waitForDeployment();
  const osloDEXAddress = await osloDEX.getAddress();
  console.log("   OsloDEX deployed to:", osloDEXAddress);

  // 4. Deploy ReferralRegistry
  console.log("\n4. Deploying ReferralRegistry...");
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = await ReferralRegistry.deploy(usdtAddress, osloDEXAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   ReferralRegistry deployed to:", registryAddress);

  // 5. Deploy RewardVault
  console.log("\n5. Deploying RewardVault...");
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const vault = await RewardVault.deploy(usdtAddress, osloTokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("   RewardVault deployed to:", vaultAddress);

  // 6. Deploy LevelIncomeSystem
  console.log("\n6. Deploying LevelIncomeSystem...");
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(registryAddress, osloDEXAddress, osloTokenAddress);
  await levelSystem.waitForDeployment();
  const levelSystemAddress = await levelSystem.getAddress();
  console.log("   LevelIncomeSystem deployed to:", levelSystemAddress);

  // Wallet addresses for deposit splits (2% reward, 1% company, 1% performance)
  const REWARD_WALLET = process.env.REWARD_WALLET || deployer.address;
  const COMPANY_WALLET = process.env.COMPANY_WALLET || deployer.address;
  const PERF_WALLET = process.env.PERF_WALLET || deployer.address;

  // 7. Deploy InvestmentEngine
  console.log("\n7. Deploying InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    usdtAddress,
    osloTokenAddress,
    osloDEXAddress,
    vaultAddress,
    registryAddress,
    levelSystemAddress,
    COMPANY_WALLET,
    PERF_WALLET
  );
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("   InvestmentEngine deployed to:", engineAddress);

  // Set reward wallet (2% USDT destination) — defaults to vault, override to REWARD_WALLET
  if (REWARD_WALLET !== deployer.address) {
    await engine.setRewardWallet(REWARD_WALLET);
    console.log("   Reward wallet set to:", REWARD_WALLET);
  }
  console.log("   Company wallet:", COMPANY_WALLET);
  console.log("   Performance wallet:", PERF_WALLET);

  // 8. Deploy OsloDAO
  console.log("\n8. Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(usdtAddress, engineAddress);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("   OsloDAO deployed to:", daoAddress);

  // 9. Deploy LeadershipBonus
  console.log("\n9. Deploying LeadershipBonus...");
  const LeadershipBonus = await ethers.getContractFactory("LeadershipBonus");
  const leadershipBonus = await LeadershipBonus.deploy(
    registryAddress,
    osloDEXAddress,
    osloTokenAddress,
    vaultAddress
  );
  await leadershipBonus.waitForDeployment();
  const leadershipBonusAddress = await leadershipBonus.getAddress();
  console.log("   LeadershipBonus deployed to:", leadershipBonusAddress);

  // 10. Wire permissions
  console.log("\n10. Wiring permissions...");
  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  // OsloToken burner roles
  await osloToken.grantRole(BURNER_ROLE, osloDEXAddress);
  await osloToken.grantRole(BURNER_ROLE, engineAddress);
  console.log("   Granted BURNER_ROLE to OsloDEX + Engine");

  // Engine permissions on other contracts
  await vault.grantRole(ENGINE_ROLE, engineAddress);
  await osloDEX.grantRole(ENGINE_ROLE, engineAddress);
  await registry.grantRole(ENGINE_ROLE, engineAddress);
  await levelSystem.grantRole(ENGINE_ROLE, engineAddress);
  console.log("   Granted ENGINE_ROLE to Engine on Vault, DEX, Registry, LevelSystem");

  // LevelSystem <-> Engine
  await engine.grantRole(LEVEL_SYSTEM_ROLE, levelSystemAddress);
  await levelSystem.setInvestmentEngine(engineAddress);
  console.log("   Wired LevelSystem <-> Engine");

  // LeadershipBonus permissions
  await vault.grantRole(ENGINE_ROLE, leadershipBonusAddress);
  await leadershipBonus.grantRole(ENGINE_ROLE, engineAddress);
  await engine.grantRole(LEVEL_SYSTEM_ROLE, leadershipBonusAddress);
  await engine.setLeadershipBonus(leadershipBonusAddress);
  await leadershipBonus.setInvestmentEngine(engineAddress);
  console.log("   Wired LeadershipBonus <-> Engine + Vault");

  // DAO
  await dao.setReferralRegistry(registryAddress);
  await engine.setDAOContract(daoAddress);
  console.log("   Wired DAO <-> Registry + Engine->DAO 0.5% funding");
  console.log("   All permissions wired!");

  // 11. Transfer reserves
  console.log("\n11. Transferring token reserves...");
  await osloToken.transfer(vaultAddress, ethers.parseEther("10400000"));
  console.log("   Transferred 10.4M OSLO to RewardVault");
  await osloToken.transfer(osloDEXAddress, ethers.parseEther("100000"));
  console.log("   Transferred 100K OSLO to OsloDEX");

  // 12. Seed DEX with USDT liquidity
  console.log("\n12. Seeding DEX liquidity...");
  await usdt.mint(osloDEXAddress, ethers.parseUnits("2000", 6));
  await osloDEX.seedLiquidity(ethers.parseUnits("2000", 6), ethers.parseEther("100000"));
  console.log("   Seeded DEX: 2000 USDT + 100K OSLO");

  // 13. Fund LevelIncomeSystem with OSLO for commission payouts
  console.log("\n13. Funding LevelIncomeSystem with OSLO...");
  await osloToken.transfer(levelSystemAddress, ethers.parseEther("500000"));
  console.log("   Transferred 500K OSLO to LevelIncomeSystem");

  // 14. Mint some test USDT to deployer for testing
  console.log("\n14. Minting test USDT to deployer...");
  await usdt.mint(deployer.address, ethers.parseUnits("100000", 6));
  console.log("   Minted 100,000 test USDT to deployer");

  // Summary
  console.log("\n========================================");
  console.log("TESTNET DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("MockUSDT:         ", usdtAddress);
  console.log("OsloToken:        ", osloTokenAddress);
  console.log("OsloDEX:          ", osloDEXAddress);
  console.log("ReferralRegistry: ", registryAddress);
  console.log("RewardVault:      ", vaultAddress);
  console.log("LevelIncomeSystem:", levelSystemAddress);
  console.log("InvestmentEngine: ", engineAddress);
  console.log("OsloDAO:          ", daoAddress);
  console.log("LeadershipBonus:  ", leadershipBonusAddress);
  console.log("========================================");

  // Save deployment info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const deploymentInfo = {
    network: chainId === 97 ? "bscTestnet" : "localhost",
    chainId: chainId,
    deployer: deployer.address,
    contracts: {
      MockUSDT: usdtAddress,
      OsloToken: osloTokenAddress,
      OsloDEX: osloDEXAddress,
      ReferralRegistry: registryAddress,
      RewardVault: vaultAddress,
      LevelIncomeSystem: levelSystemAddress,
      InvestmentEngine: engineAddress,
      OsloDAO: daoAddress,
      LeadershipBonus: leadershipBonusAddress,
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`deployments-${chainId}.json`, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to deployments-${chainId}.json`);

  // Also generate frontend .env.local
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo-project-id";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const envContent = `NEXT_PUBLIC_WC_PROJECT_ID=${wcProjectId}
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}
NEXT_PUBLIC_OSLO_TOKEN_ADDRESS=${osloTokenAddress}
NEXT_PUBLIC_OSLO_DEX_ADDRESS=${osloDEXAddress}
NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${engineAddress}
NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS=${registryAddress}
NEXT_PUBLIC_REWARD_VAULT_ADDRESS=${vaultAddress}
NEXT_PUBLIC_OSLO_DAO_ADDRESS=${daoAddress}
NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=${leadershipBonusAddress}
NEXT_PUBLIC_LEVEL_INCOME_SYSTEM_ADDRESS=${levelSystemAddress}
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
