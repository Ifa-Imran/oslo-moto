import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeployment script — fixes USDT decimals from 6 to 18 for BSC mainnet.
 *
 * Keeps: OsloToken, OsloDEX, RewardVault (no 6-dec constants, no dependency changes)
 * Redeploys: ReferralRegistry, LevelIncomeSystem, InvestmentEngine, LeadershipBonus, OsloDAO
 * Re-seeds: Referral tree (104 users) + Stakes (~$2.8M) from backup
 *
 * Usage:
 *   npx hardhat run scripts/deploy/redeploy-18decimals.ts --network bscMainnet
 */

// ============ EXISTING CONTRACTS (KEEP AS-IS) ============
const OSLO_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";

// ============ OLD CONTRACTS (TO BE REPLACED) ============
const OLD_REGISTRY = "0x06cd1ADc500098f5cc65225D712CBF46939B2ee1";
const OLD_LEVEL = "0xDcC54b0D776A89C0F2033867a815754C2bf49aE3";
const OLD_ENGINE = "0x55bD08872d55fa6ac405fB3580c27740474cc4D9";
const OLD_LB = "0xA56e83e375FC6b62CE633759836f5D32785cfe9C";
const OLD_DAO = "0xBA572D3204D126Cf3A5f1FaA1643b60c057206C4";

// ============ WALLETS ============
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

// ============ BACKUP FILE ============
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("REDEPLOY (18-decimal fix) with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  if (ethers.parseEther("0.05") > await ethers.provider.getBalance(deployer.address)) {
    console.log("ERROR: Insufficient BNB for gas. Need at least ~0.05 BNB.");
    return;
  }

  // =====================================================
  // PHASE 1: DEPLOY 5 NEW CONTRACTS
  // =====================================================
  console.log("\n========== PHASE 1: DEPLOY 5 NEW CONTRACTS ==========");

  // 1. ReferralRegistry (USDT, DEX — both unchanged)
  console.log("1. Deploying ReferralRegistry...");
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = await ReferralRegistry.deploy(USDT_ADDR, DEX_ADDR);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("   ReferralRegistry:", registryAddr);

  // 2. LevelIncomeSystem (new registry, DEX, OsloToken)
  console.log("2. Deploying LevelIncomeSystem...");
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(registryAddr, DEX_ADDR, OSLO_ADDR);
  await levelSystem.waitForDeployment();
  const levelAddr = await levelSystem.getAddress();
  console.log("   LevelIncomeSystem:", levelAddr);

  // 3. InvestmentEngine (USDT, OsloToken, DEX, Vault, new registry, new level, COMPANY, PERF)
  console.log("3. Deploying InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    USDT_ADDR, OSLO_ADDR, DEX_ADDR, VAULT_ADDR, registryAddr, levelAddr, COMPANY_WALLET, PERF_WALLET
  );
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("   InvestmentEngine:", engineAddr);

  // 4. LeadershipBonus (new registry, DEX, OsloToken, Vault)
  console.log("4. Deploying LeadershipBonus...");
  const LeadershipBonus = await ethers.getContractFactory("LeadershipBonus");
  const lb = await LeadershipBonus.deploy(registryAddr, DEX_ADDR, OSLO_ADDR, VAULT_ADDR);
  await lb.waitForDeployment();
  const lbAddr = await lb.getAddress();
  console.log("   LeadershipBonus:", lbAddr);

  // 5. OsloDAO (USDT, new engine)
  console.log("5. Deploying OsloDAO...");
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
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEFAULT_ADMIN_ROLE"));

  const roleABI = [
    "function grantRole(bytes32, address) external",
    "function revokeRole(bytes32, address) external",
  ];

  // --- 2a. Revoke old roles on KEPT contracts ---
  console.log("--- 2a: Revoking old roles ---");
  const tokenC = new ethers.Contract(OSLO_ADDR, roleABI, deployer);
  const dexC = new ethers.Contract(DEX_ADDR, roleABI, deployer);
  const vaultC = new ethers.Contract(VAULT_ADDR, roleABI, deployer);

  try { await tokenC.revokeRole(BURNER_ROLE, OLD_ENGINE); } catch {}
  try { await dexC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await vaultC.revokeRole(ENGINE_ROLE, OLD_ENGINE); } catch {}
  try { await vaultC.revokeRole(ENGINE_ROLE, OLD_LB); } catch {}
  console.log("   Old roles revoked on Token, DEX, Vault");

  // --- 2b. Grant new roles on KEPT contracts ---
  console.log("--- 2b: Granting new roles on kept contracts ---");
  await tokenC.grantRole(BURNER_ROLE, engineAddr);
  await dexC.grantRole(ENGINE_ROLE, engineAddr);
  await vaultC.grantRole(ENGINE_ROLE, engineAddr);
  await vaultC.grantRole(ENGINE_ROLE, lbAddr);
  console.log("   BURNER_ROLE → new engine on Token");
  console.log("   ENGINE_ROLE → new engine on DEX");
  console.log("   ENGINE_ROLE → new engine + new LB on Vault");

  // --- 2c. Grant roles on NEW contracts ---
  console.log("--- 2c: Granting roles on new contracts ---");
  const newRegistryC = new ethers.Contract(registryAddr, roleABI, deployer);
  const newLevelC = new ethers.Contract(levelAddr, roleABI, deployer);
  const newLbC = new ethers.Contract(lbAddr, roleABI, deployer);

  await newRegistryC.grantRole(ENGINE_ROLE, engineAddr);
  await newRegistryC.grantRole(ENGINE_ROLE, deployer.address); // for seeding
  await newLevelC.grantRole(ENGINE_ROLE, engineAddr);
  await newLbC.grantRole(ENGINE_ROLE, engineAddr);
  console.log("   ENGINE_ROLE → engine on Registry, LevelSystem, LeadershipBonus");
  console.log("   ENGINE_ROLE → deployer on Registry (for seeding)");

  // --- 2d. Wire settable addresses on new contracts ---
  console.log("--- 2d: Wiring settable addresses ---");
  const engineSetupABI = [
    "function grantRole(bytes32, address) external",
    "function setLeadershipBonus(address) external",
    "function setDAOContract(address) external",
    "function setRewardWallet(address) external",
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function adminSeedClaimed(address, uint256) external",
  ];
  const engineC = new ethers.Contract(engineAddr, engineSetupABI, deployer);

  await engineC.grantRole(LEVEL_SYSTEM_ROLE, levelAddr);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, lbAddr);
  await engineC.setLeadershipBonus(lbAddr);
  await engineC.setDAOContract(daoAddr);
  await engineC.setRewardWallet(REWARD_WALLET);
  console.log("   LEVEL_SYSTEM_ROLE → LevelSystem + LB on engine");
  console.log("   setLeadershipBonus, setDAOContract, setRewardWallet on engine");

  const setEngineABI = ["function setInvestmentEngine(address) external"];
  const levelSetC = new ethers.Contract(levelAddr, setEngineABI, deployer);
  const lbSetC = new ethers.Contract(lbAddr, setEngineABI, deployer);
  await levelSetC.setInvestmentEngine(engineAddr);
  await lbSetC.setInvestmentEngine(engineAddr);
  console.log("   setInvestmentEngine on LevelSystem + LeadershipBonus");

  const daoABI = ["function setReferralRegistry(address) external"];
  const daoC = new ethers.Contract(daoAddr, daoABI, deployer);
  await daoC.setReferralRegistry(registryAddr);
  console.log("   setReferralRegistry on DAO");

  // =====================================================
  // PHASE 3: SEED DATA FROM BACKUP
  // =====================================================
  console.log("\n========== PHASE 3: SEED DATA ==========");

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`   Backup: ${backup._meta.totalUsers} users, ${backup._meta.withActiveDeposit} with deposits`);

  // --- 3a. Seed Referral Tree ---
  console.log("\n--- 3a: Seeding Referral Tree ---");

  const registrySeedABI = [
    "function registerReferral(address, address) external",
    "function directReferrer(address) view returns (address)",
  ];
  const registrySeed = new ethers.Contract(registryAddr, registrySeedABI, deployer);

  // Build referrer map
  const userReferrerMap = new Map<string, string>();
  for (const u of backup.users) {
    let referrer: string | null = null;
    if (u.referral_old?.registered && u.referral_old?.referrer) {
      referrer = u.referral_old.referrer;
    }
    if (!referrer && u.referral_current?.registered && u.referral_current?.referrer) {
      referrer = u.referral_current.referrer;
    }
    if (!referrer && u.referrer) {
      referrer = u.referrer;
    }
    userReferrerMap.set(u.address.toLowerCase(), referrer || "");
  }

  const rootUsers = backup.users.filter((u: any) => !userReferrerMap.get(u.address.toLowerCase()));
  const referredUsers = backup.users.filter((u: any) => userReferrerMap.get(u.address.toLowerCase()));
  console.log(`   Root users (no referrer): ${rootUsers.length}`);
  console.log(`   Referred users: ${referredUsers.length}`);

  const allAddresses = new Set(backup.users.map((u: any) => u.address.toLowerCase()));

  let registered = new Set<string>();
  rootUsers.forEach((u: any) => registered.add(u.address.toLowerCase()));

  let pending = [...referredUsers].filter((u: any) => !registered.has(u.address.toLowerCase()));
  let pass = 0;
  let totalRegistered = 0;

  while (pending.length > 0) {
    pass++;
    const stillPending: any[] = [];

    for (const user of pending) {
      const userAddr = user.address;
      const referrerAddr = userReferrerMap.get(userAddr.toLowerCase())!;
      const referrerLower = referrerAddr.toLowerCase();
      const isKnownRoot = registered.has(referrerLower);
      const isExternal = !allAddresses.has(referrerLower);

      if (isKnownRoot || isExternal) {
        try {
          await registrySeed.registerReferral(userAddr, referrerAddr);
          registered.add(userAddr.toLowerCase());
          totalRegistered++;
        } catch (e: any) {
          if (e.message.includes("0x3a81d6fc") || e.message.includes("AlreadyRegistered")) {
            registered.add(userAddr.toLowerCase());
          } else if (!e.message.includes("insufficient funds")) {
            console.log(`   WARN: Failed ${userAddr.substring(0, 12)}...: ${e.message.substring(0, 80)}`);
          }
          if (e.message.includes("insufficient funds")) {
            console.log(`   OUT OF BNB! Stopped. ${totalRegistered} referrals registered so far.`);
            return;
          }
        }
      } else {
        stillPending.push(user);
      }
    }

    pending = stillPending;
    if (pass > 30) break;
  }

  console.log(`   Registered ${totalRegistered} referral relationships in ${pass} passes`);

  // --- 3b. Seed Stakes (18 decimals for BSC USDT) ---
  console.log("\n--- 3b: Seeding Stakes (18 decimals) ---");

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

    // Use 18 decimals for BSC mainnet USDT
    const amount = ethers.parseUnits(currentDeposit.toString(), 18);
    const tier = currentDeposit >= 2500 ? 2 : 1;
    const earnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    const earningsAmount = ethers.parseUnits(earnings.toString(), 18);

    try {
      await engineC.adminSeedStake(user.address, amount, tier, earningsAmount);
      totalSeeded++;
      totalAmount += amount;
      totalEarningsSeeded += earningsAmount;

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

  // --- 3c. Verify ---
  console.log("\n--- 3c: Verification ---");
  const engineViewABI = [
    "function totalUsers() view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
    "function totalProtocolTurnover() view returns (uint256)",
  ];
  const engineView = new ethers.Contract(engineAddr, engineViewABI, deployer);
  const totalUsers = await engineView.totalUsers();
  const totalActive = await engineView.totalActiveStakes();
  const totalTurnover = await engineView.totalProtocolTurnover();
  console.log(`   totalUsers: ${totalUsers}`);
  console.log(`   totalActiveStakes: ${ethers.formatUnits(totalActive, 18)} USDT`);
  console.log(`   totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // =====================================================
  // PHASE 4: UPDATE .env.local
  // =====================================================
  console.log("\n========== PHASE 4: UPDATE .env.local ==========");

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  const updates: Record<string, string> = {
    "NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS": engineAddr,
    "NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS": registryAddr,
    "NEXT_PUBLIC_OSLO_DAO_ADDRESS": daoAddr,
    "NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS": lbAddr,
    "NEXT_PUBLIC_LEVEL_INCOME_SYSTEM_ADDRESS": levelAddr,
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
  console.log("REDEPLOYMENT COMPLETE (18-decimal fix)");
  console.log("========================================");
  console.log("KEPT:");
  console.log("  OsloToken:         ", OSLO_ADDR);
  console.log("  OsloDEX:           ", DEX_ADDR);
  console.log("  RewardVault:       ", VAULT_ADDR);
  console.log("NEW:");
  console.log("  ReferralRegistry:  ", registryAddr);
  console.log("  LevelIncomeSystem: ", levelAddr);
  console.log("  InvestmentEngine:  ", engineAddr);
  console.log("  LeadershipBonus:   ", lbAddr);
  console.log("  OsloDAO:           ", daoAddr);
  console.log("========================================");
  console.log(`Seeded: ${totalSeeded} stakes, ${totalRegistered} referrals`);
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
