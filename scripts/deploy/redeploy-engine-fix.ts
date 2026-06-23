import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeploy InvestmentEngine + OsloDAO to fix the seededEarnings bug.
 *
 * Bug: adminSeedStake set totalEarnings = historical earnings, but stakeStartTime = migration time.
 *      getClaimableYield checks accrued <= totalEarnings → always 0 → users can't claim.
 *
 * Fix: adminSeedStake now sets totalEarnings = 0, tracks historical earnings in seededEarnings mapping.
 *      getClaimableYield/claimYield use (totalEarnings + seededEarnings) for 3X cap, but only
 *      subtract totalEarnings (not seededEarnings) from accrued → users can claim new yield immediately.
 *
 * Keeps: OsloToken, OsloDEX, RewardVault, ReferralRegistry, LevelIncomeSystem, LeadershipBonus
 * Redeploys: InvestmentEngine, OsloDAO
 * Re-seeds: Stakes from backup (referral tree already in existing Registry)
 *
 * Usage:
 *   npx hardhat run scripts/deploy/redeploy-engine-fix.ts --network bscMainnet
 */

// ============ EXISTING CONTRACTS (KEEP AS-IS) ============
const OSLO_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const LEVEL_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const LB_ADDR = "0xE05c36e61B81E34d7063627280dE8a9c4CD96e64";

// ============ OLD CONTRACTS (TO BE REPLACED) ============
const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const OLD_DAO = "0x9dAD8d105aa8dE0cBE6206A7472311B4846f786d";

// ============ WALLETS ============
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

// ============ BACKUP FILE ============
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("REDEPLOY ENGINE FIX with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  if (ethers.parseEther("0.05") > await ethers.provider.getBalance(deployer.address)) {
    console.log("ERROR: Insufficient BNB for gas. Need at least ~0.05 BNB.");
    return;
  }

  // =====================================================
  // PHASE 1: DEPLOY 2 NEW CONTRACTS
  // =====================================================
  console.log("\n========== PHASE 1: DEPLOY NEW CONTRACTS ==========");

  // 1. InvestmentEngine (USDT, OsloToken, DEX, Vault, existing Registry, existing Level, COMPANY, PERF)
  console.log("1. Deploying InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    USDT_ADDR, OSLO_ADDR, DEX_ADDR, VAULT_ADDR, REGISTRY_ADDR, LEVEL_ADDR, COMPANY_WALLET, PERF_WALLET
  );
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("   InvestmentEngine:", engineAddr);

  // 2. OsloDAO (USDT, new engine)
  console.log("2. Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(USDT_ADDR, engineAddr);
  await dao.waitForDeployment();
  const daoAddr = await dao.getAddress();
  console.log("   OsloDAO:", daoAddr);

  // =====================================================
  // PHASE 2: WIRE PERMISSIONS
  // =====================================================
  console.log("\n========== PHASE 2: WIRE PERMISSIONS ==========");

  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  const roleABI = [
    "function grantRole(bytes32, address) external",
    "function revokeRole(bytes32, address) external",
  ];

  // --- 2a. Revoke old engine roles on KEPT contracts ---
  console.log("--- 2a: Revoking old engine roles ---");
  const tokenC = new ethers.Contract(OSLO_ADDR, roleABI, deployer);
  const dexC = new ethers.Contract(DEX_ADDR, roleABI, deployer);
  const vaultC = new ethers.Contract(VAULT_ADDR, roleABI, deployer);

  try { await tokenC.revokeRole(BURNER_ROLE, OLD_ENGINE); } catch {}
  try { await dexC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await vaultC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  console.log("   Old engine roles revoked on Token, DEX, Vault");

  // --- 2b. Grant new engine roles on KEPT contracts ---
  console.log("--- 2b: Granting new engine roles ---");
  await tokenC.grantRole(BURNER_ROLE, engineAddr);
  await dexC.grantRole(ENGINE_ROLE, engineAddr);
  await vaultC.grantRole(ENGINE_ROLE, engineAddr);
  console.log("   BURNER_ROLE → new engine on Token");
  console.log("   ENGINE_ROLE → new engine on DEX + Vault");

  // --- 2c. Grant roles on NEW engine ---
  console.log("--- 2c: Granting roles on new engine ---");
  const engineRoleABI = [
    "function grantRole(bytes32, address) external",
    "function setLeadershipBonus(address) external",
    "function setDAOContract(address) external",
    "function setRewardWallet(address) external",
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function adminSeedClaimed(address, uint256) external",
    "function adminSetSeededEarnings(address, uint256) external",
  ];
  const engineC = new ethers.Contract(engineAddr, engineRoleABI, deployer);

  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LEVEL_ADDR);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, LB_ADDR);
  await engineC.setLeadershipBonus(LB_ADDR);
  await engineC.setDAOContract(daoAddr);
  await engineC.setRewardWallet(REWARD_WALLET);
  console.log("   LEVEL_SYSTEM_ROLE → LevelSystem + LB on new engine");
  console.log("   setLeadershipBonus, setDAOContract, setRewardWallet done");

  // --- 2d. Update engine pointer on LevelSystem + LeadershipBonus ---
  console.log("--- 2d: Updating engine pointer on LevelSystem + LB ---");
  const setEngineABI = ["function setInvestmentEngine(address) external"];
  const levelSetC = new ethers.Contract(LEVEL_ADDR, setEngineABI, deployer);
  const lbSetC = new ethers.Contract(LB_ADDR, setEngineABI, deployer);
  await levelSetC.setInvestmentEngine(engineAddr);
  await lbSetC.setInvestmentEngine(engineAddr);
  console.log("   setInvestmentEngine done on LevelSystem + LeadershipBonus");

  // --- 2e. Set ReferralRegistry on new DAO ---
  console.log("--- 2e: Setting ReferralRegistry on new DAO ---");
  const daoABI = ["function setReferralRegistry(address) external"];
  const daoC = new ethers.Contract(daoAddr, daoABI, deployer);
  await daoC.setReferralRegistry(REGISTRY_ADDR);
  console.log("   setReferralRegistry done on new DAO");

  // =====================================================
  // PHASE 3: RE-SEED STAKES FROM BACKUP
  // =====================================================
  console.log("\n========== PHASE 3: RE-SEED STAKES ==========");

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`   Backup: ${backup._meta.totalUsers} users, ${backup._meta.withActiveDeposit} with deposits`);

  const usersWithDeposits = backup.users.filter((u: any) => {
    const cur = parseFloat(u.investmentEngine?.activeDeposit || "0");
    return cur > 0;
  });
  console.log(`   Users with deposits: ${usersWithDeposits.length}`);

  let totalSeeded = 0;
  let totalAmount = 0n;
  let skipped = 0;
  let totalEarningsSeeded = 0n;

  for (const user of usersWithDeposits) {
    const currentDeposit = parseFloat(user.investmentEngine?.activeDeposit || "0");
    if (currentDeposit <= 0) { skipped++; continue; }

    const amount = ethers.parseUnits(currentDeposit.toString(), 18);
    const tier = currentDeposit >= 2500 ? 2 : 1;
    const earnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    const earningsAmount = ethers.parseUnits(earnings.toString(), 18);

    try {
      // adminSeedStake now sets totalEarnings=0 and seededEarnings[user]+=earnings
      await engineC.adminSeedStake(user.address, amount, tier, earningsAmount);
      totalSeeded++;
      totalAmount += amount;
      totalEarningsSeeded += earningsAmount;

      // Also seed totalClaimed for display purposes
      if (earnings > 0) {
        await engineC.adminSeedClaimed(user.address, earningsAmount);
      }
    } catch (e: any) {
      if (e.message.includes("insufficient funds")) {
        console.log(`   OUT OF BNB! Stopped at user ${totalSeeded + 1}/${usersWithDeposits.length}`);
        return;
      }
      console.log(`   WARN: Failed to seed stake for ${user.address.substring(0, 12)}...: ${e.message.substring(0, 100)}`);
      skipped++;
    }
  }

  console.log(`   Seeded ${totalSeeded} stakes, skipped ${skipped}`);
  console.log(`   Total staked: ${ethers.formatUnits(totalAmount, 18)} USDT`);
  console.log(`   Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 18)} USDT`);

  // =====================================================
  // PHASE 4: VERIFY
  // =====================================================
  console.log("\n========== PHASE 4: VERIFY ==========");
  const engineViewABI = [
    "function totalUsers() view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
    "function totalProtocolTurnover() view returns (uint256)",
    "function getClaimableYield(address) view returns (uint256)",
  ];
  const engineView = new ethers.Contract(engineAddr, engineViewABI, deployer);
  const totalUsers = await engineView.totalUsers();
  const totalActive = await engineView.totalActiveStakes();
  const totalTurnover = await engineView.totalProtocolTurnover();
  console.log(`   totalUsers: ${totalUsers}`);
  console.log(`   totalActiveStakes: ${ethers.formatUnits(totalActive, 18)} USDT`);
  console.log(`   totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // =====================================================
  // PHASE 5: UPDATE .env.local
  // =====================================================
  console.log("\n========== PHASE 5: UPDATE .env.local ==========");

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  const updates: Record<string, string> = {
    "NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS": engineAddr,
    "NEXT_PUBLIC_OSLO_DAO_ADDRESS": daoAddr,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`${key}=.*`, "g");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${key}=${value}\n`;
    }
  }
  fs.writeFileSync(envPath, envContent);
  console.log("   .env.local updated with new contract addresses");

  // =====================================================
  // SUMMARY
  // =====================================================
  console.log("\n========================================");
  console.log("ENGINE FIX REDEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("KEPT:");
  console.log("  OsloToken:         ", OSLO_ADDR);
  console.log("  OsloDEX:           ", DEX_ADDR);
  console.log("  RewardVault:       ", VAULT_ADDR);
  console.log("  ReferralRegistry:  ", REGISTRY_ADDR);
  console.log("  LevelIncomeSystem: ", LEVEL_ADDR);
  console.log("  LeadershipBonus:   ", LB_ADDR);
  console.log("NEW:");
  console.log("  InvestmentEngine:  ", engineAddr);
  console.log("  OsloDAO:           ", daoAddr);
  console.log("OLD (deprecated):");
  console.log("  Old Engine:        ", OLD_ENGINE);
  console.log("  Old DAO:           ", OLD_DAO);
  console.log("========================================");
  console.log(`Seeded: ${totalSeeded} stakes`);
  console.log(`Total staked: ${ethers.formatUnits(totalAmount, 18)} USDT`);
  console.log(`Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 18)} USDT`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
