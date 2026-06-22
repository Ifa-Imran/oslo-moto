import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeploy InvestmentEngine (with setDAOContract, setRewardWallet, 0.5% DAO split)
 * and OsloDAO (with claimRoyalty, permissionless distributeRoyalties, cycle tracking).
 * Re-wires all permissions and sets all wallet addresses.
 * Keeps existing: MockUSDT, OsloToken, OsloDEX, ReferralRegistry, RewardVault, LevelIncomeSystem, LeadershipBonus.
 */

// Existing deployed contracts (BSC Testnet)
const USDT_ADDRESS = "0xd066492bfDE1313EF3C7e4f4D875a60B0c7a5A50";
const OSLO_TOKEN = "0x1299d60D2c9464a05c189CE73DfC18550f594A03";
const OSLO_DEX = "0x8AEaf623D7D07369b1c3Da794326b840E6DB607a";
const REGISTRY = "0x868ac359d31c5083Aff193a829eF0d74AF3F610B";
const VAULT = "0x5e299472FF7DA8331465E95349a14d1aa1Be5750";
const LEVEL_SYSTEM = "0x970a64B9F7F1918839115e1ADbD33e1667B8dcAb";
const LEADERSHIP_BONUS = "0x268D5AF23e3524287881Fb391b4a0226c84F88EC";

// Wallet addresses
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying Engine + DAO with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // --- 1. Deploy new InvestmentEngine ---
  console.log("\n1. Deploying new InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    USDT_ADDRESS,
    OSLO_TOKEN,
    OSLO_DEX,
    VAULT,
    REGISTRY,
    LEVEL_SYSTEM,
    COMPANY_WALLET,
    PERF_WALLET
  );
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("   InvestmentEngine deployed to:", engineAddress);

  // --- 2. Deploy new OsloDAO ---
  console.log("\n2. Deploying new OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(USDT_ADDRESS, engineAddress);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("   OsloDAO deployed to:", daoAddress);

  // --- 3. Wire permissions ---
  console.log("\n3. Wiring permissions...");
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));
  const BURNER_ROLE = ethers.id("BURNER_ROLE");

  // Grant BURNER_ROLE to new engine on OsloToken
  const tokenABI = ["function grantRole(bytes32, address) external"];
  const token = new ethers.Contract(OSLO_TOKEN, tokenABI, deployer);
  await token.grantRole(BURNER_ROLE, engineAddress);
  console.log("   Granted BURNER_ROLE to new engine");

  // Grant ENGINE_ROLE to new engine on Vault, DEX, Registry, LevelSystem
  const roleABI = ["function grantRole(bytes32, address) external"];
  const vault = new ethers.Contract(VAULT, roleABI, deployer);
  const dex = new ethers.Contract(OSLO_DEX, roleABI, deployer);
  const registry = new ethers.Contract(REGISTRY, roleABI, deployer);
  const levelSystem = new ethers.Contract(LEVEL_SYSTEM, roleABI, deployer);
  const leadershipBonus = new ethers.Contract(LEADERSHIP_BONUS, roleABI, deployer);

  await vault.grantRole(ENGINE_ROLE, engineAddress);
  await dex.grantRole(ENGINE_ROLE, engineAddress);
  await registry.grantRole(ENGINE_ROLE, engineAddress);
  await levelSystem.grantRole(ENGINE_ROLE, engineAddress);
  await leadershipBonus.grantRole(ENGINE_ROLE, engineAddress);
  console.log("   Granted ENGINE_ROLE to new engine on Vault, DEX, Registry, LevelSystem, LeadershipBonus");

  // Grant LEVEL_SYSTEM_ROLE on new engine to LevelSystem and LeadershipBonus
  const engineRoleABI = ["function grantRole(bytes32, address) external", "function setLeadershipBonus(address) external", "function setDAOContract(address) external", "function setRewardWallet(address) external", "function setCompanyWallet(address) external", "function setPerfWallet(address) external"];
  const engineContract = new ethers.Contract(engineAddress, engineRoleABI, deployer);
  await engineContract.grantRole(LEVEL_SYSTEM_ROLE, LEVEL_SYSTEM);
  await engineContract.grantRole(LEVEL_SYSTEM_ROLE, LEADERSHIP_BONUS);
  console.log("   Granted LEVEL_SYSTEM_ROLE to LevelSystem + LeadershipBonus");

  // Wire LevelSystem and LeadershipBonus to new engine
  const setEngineABI = ["function setInvestmentEngine(address) external"];
  const levelSystemContract = new ethers.Contract(LEVEL_SYSTEM, setEngineABI, deployer);
  const leadershipBonusContract = new ethers.Contract(LEADERSHIP_BONUS, setEngineABI, deployer);
  await levelSystemContract.setInvestmentEngine(engineAddress);
  await leadershipBonusContract.setInvestmentEngine(engineAddress);
  console.log("   Wired LevelSystem + LeadershipBonus -> new engine");

  // Set LeadershipBonus on new engine
  await engineContract.setLeadershipBonus(LEADERSHIP_BONUS);
  console.log("   Set LeadershipBonus on new engine");

  // --- 4. Set wallet addresses on new engine ---
  console.log("\n4. Setting wallet addresses...");
  await engineContract.setRewardWallet(REWARD_WALLET);
  await engineContract.setDAOContract(daoAddress);
  console.log("   Reward wallet:", REWARD_WALLET);
  console.log("   DAO contract:", daoAddress);
  console.log("   Company wallet:", COMPANY_WALLET, "(set in constructor)");
  console.log("   Performance wallet:", PERF_WALLET, "(set in constructor)");

  // --- 5. Wire DAO ---
  console.log("\n5. Wiring DAO...");
  const daoABI = ["function setReferralRegistry(address) external"];
  const daoContract = new ethers.Contract(daoAddress, daoABI, deployer);
  await daoContract.setReferralRegistry(REGISTRY);
  console.log("   DAO <-> Registry wired");

  // --- 6. Update .env.local ---
  console.log("\n6. Updating frontend .env.local...");
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(/NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=.*/, `NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${engineAddress}`);
  envContent = envContent.replace(/NEXT_PUBLIC_OSLO_DAO_ADDRESS=.*/, `NEXT_PUBLIC_OSLO_DAO_ADDRESS=${daoAddress}`);
  fs.writeFileSync(envPath, envContent);
  console.log("   .env.local updated.");

  // --- Summary ---
  console.log("\n========================================");
  console.log("ENGINE + DAO REDEPLOYED");
  console.log("========================================");
  console.log("InvestmentEngine: ", engineAddress);
  console.log("OsloDAO:          ", daoAddress);
  console.log("========================================");
  console.log("\nNew features:");
  console.log("  InvestmentEngine:");
  console.log("    - 0.5% DAO split (95.5/2/1/1/0.5)");
  console.log("    - setRewardWallet() for 2% USDT");
  console.log("    - setDAOContract() for 0.5% USDT");
  console.log("  OsloDAO:");
  console.log("    - claimRoyalty(): individual claim");
  console.log("    - distributeRoyalties(): permissionless");
  console.log("    - Auto-sync turnover + cap to balance");
  console.log("    - Cycle-based claiming");
  console.log("========================================");
  console.log("\nKept existing:");
  console.log("  MockUSDT:         ", USDT_ADDRESS);
  console.log("  OsloToken:        ", OSLO_TOKEN);
  console.log("  OsloDEX:          ", OSLO_DEX);
  console.log("  ReferralRegistry: ", REGISTRY);
  console.log("  RewardVault:      ", VAULT);
  console.log("  LevelIncomeSystem:", LEVEL_SYSTEM);
  console.log("  LeadershipBonus:  ", LEADERSHIP_BONUS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
