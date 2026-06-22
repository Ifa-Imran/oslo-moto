import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Full deployment + data seeding script.
 * Reads mainnet backup JSON and seeds all referral + stake data to fresh testnet contracts.
 */

// Wallet addresses for deposit split
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";

// Backup file (latest = most complete)
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

// DEX initial liquidity
const DEX_SEED_USDT = ethers.parseUnits("2000", 6);
const DEX_SEED_OSLO = ethers.parseEther("100000");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying + seeding with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // =====================================================
  // PHASE 1: DEPLOY ALL CONTRACTS
  // =====================================================
  console.log("\n========== PHASE 1: DEPLOY ==========");

  // 1. MockUSDT
  console.log("\n1. Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();
  console.log("   MockUSDT:", usdtAddr);

  // 2. OsloToken
  console.log("2. Deploying OsloToken...");
  const OsloToken = await ethers.getContractFactory("OsloToken");
  const osloToken = await OsloToken.deploy(deployer.address);
  await osloToken.waitForDeployment();
  const osloAddr = await osloToken.getAddress();
  console.log("   OsloToken:", osloAddr);

  // 3. OsloDEX
  console.log("3. Deploying OsloDEX...");
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = await OsloDEX.deploy(osloAddr, usdtAddr);
  await osloDEX.waitForDeployment();
  const dexAddr = await osloDEX.getAddress();
  console.log("   OsloDEX:", dexAddr);

  // 4. ReferralRegistry
  console.log("4. Deploying ReferralRegistry...");
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = await ReferralRegistry.deploy(usdtAddr, dexAddr);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("   ReferralRegistry:", registryAddr);

  // 5. RewardVault
  console.log("5. Deploying RewardVault...");
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const vault = await RewardVault.deploy(usdtAddr, osloAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("   RewardVault:", vaultAddr);

  // 6. LevelIncomeSystem
  console.log("6. Deploying LevelIncomeSystem...");
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(registryAddr, dexAddr, osloAddr);
  await levelSystem.waitForDeployment();
  const levelAddr = await levelSystem.getAddress();
  console.log("   LevelIncomeSystem:", levelAddr);

  // 7. InvestmentEngine
  console.log("7. Deploying InvestmentEngine...");
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    usdtAddr, osloAddr, dexAddr, vaultAddr, registryAddr, levelAddr, COMPANY_WALLET, PERF_WALLET
  );
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("   InvestmentEngine:", engineAddr);

  // 8. LeadershipBonus
  console.log("8. Deploying LeadershipBonus...");
  const LeadershipBonus = await ethers.getContractFactory("LeadershipBonus");
  const leadershipBonus = await LeadershipBonus.deploy(registryAddr, dexAddr, osloAddr, vaultAddr);
  await leadershipBonus.waitForDeployment();
  const lbAddr = await leadershipBonus.getAddress();
  console.log("   LeadershipBonus:", lbAddr);

  // 9. OsloDAO
  console.log("9. Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(usdtAddr, engineAddr);
  await dao.waitForDeployment();
  const daoAddr = await dao.getAddress();
  console.log("   OsloDAO:", daoAddr);

  // =====================================================
  // PHASE 2: WIRE PERMISSIONS
  // =====================================================
  console.log("\n========== PHASE 2: WIRE PERMISSIONS ==========");

  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  const roleABI = ["function grantRole(bytes32, address) external"];
  const tokenC = new ethers.Contract(osloAddr, roleABI, deployer);
  const vaultC = new ethers.Contract(vaultAddr, roleABI, deployer);
  const dexC = new ethers.Contract(dexAddr, roleABI, deployer);
  const registryC = new ethers.Contract(registryAddr, roleABI, deployer);
  const levelC = new ethers.Contract(levelAddr, roleABI, deployer);
  const lbC = new ethers.Contract(lbAddr, roleABI, deployer);

  // Grant roles
  await tokenC.grantRole(BURNER_ROLE, dexAddr);
  await tokenC.grantRole(BURNER_ROLE, engineAddr);
  await vaultC.grantRole(ENGINE_ROLE, engineAddr);
  await vaultC.grantRole(ENGINE_ROLE, lbAddr);
  await dexC.grantRole(ENGINE_ROLE, engineAddr);
  await registryC.grantRole(ENGINE_ROLE, engineAddr);
  await levelC.grantRole(ENGINE_ROLE, engineAddr);
  await lbC.grantRole(ENGINE_ROLE, engineAddr);
  console.log("   Roles granted on Token, Vault, DEX, Registry, LevelSystem, LeadershipBonus");

  // Grant LEVEL_SYSTEM_ROLE on engine
  const engineRoleABI = [
    "function grantRole(bytes32, address) external",
    "function setLeadershipBonus(address) external",
    "function setDAOContract(address) external",
    "function setRewardWallet(address) external",
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function adminSeedClaimed(address, uint256) external",
  ];
  const engineC = new ethers.Contract(engineAddr, engineRoleABI, deployer);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, levelAddr);
  await engineC.grantRole(LEVEL_SYSTEM_ROLE, lbAddr);
  console.log("   LEVEL_SYSTEM_ROLE granted to LevelSystem + LeadershipBonus");

  // Wire setInvestmentEngine on LevelSystem + LeadershipBonus
  const setEngineABI = ["function setInvestmentEngine(address) external"];
  const levelSysC = new ethers.Contract(levelAddr, setEngineABI, deployer);
  const lbSetC = new ethers.Contract(lbAddr, setEngineABI, deployer);
  await levelSysC.setInvestmentEngine(engineAddr);
  await lbSetC.setInvestmentEngine(engineAddr);
  console.log("   setInvestmentEngine on LevelSystem + LeadershipBonus");

  // Set LeadershipBonus + DAO + RewardWallet on engine
  await engineC.setLeadershipBonus(lbAddr);
  await engineC.setDAOContract(daoAddr);
  await engineC.setRewardWallet(REWARD_WALLET);
  console.log("   setLeadershipBonus, setDAOContract, setRewardWallet on engine");

  // Wire DAO <-> Registry
  const daoABI = ["function setReferralRegistry(address) external"];
  const daoC = new ethers.Contract(daoAddr, daoABI, deployer);
  await daoC.setReferralRegistry(registryAddr);
  console.log("   DAO <-> Registry wired");

  // Transfer OSLO to vault (10M) and DEX (100K)
  await osloToken.transfer(vaultAddr, ethers.parseEther("11000000"));
  await osloToken.transfer(dexAddr, ethers.parseEther("100000"));
  console.log("   OSLO tokens transferred to Vault (11M) + DEX (100K)");

  // Seed DEX liquidity
  await usdt.mint(dexAddr, DEX_SEED_USDT);
  await osloDEX.seedLiquidity(DEX_SEED_USDT, DEX_SEED_OSLO);
  console.log("   DEX liquidity seeded ($2,000 USDT + 100K OSLO)");

  // =====================================================
  // PHASE 3: READ BACKUP & SEED DATA
  // =====================================================
  console.log("\n========== PHASE 3: SEED DATA ==========");

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`   Backup: ${backup._meta.totalUsers} users, ${backup._meta.withActiveDeposit} with deposits`);

  // --- 3a. Seed Referral Tree (use OLD referral system — more complete: 123 vs 91) ---
  console.log("\n--- 3a: Seeding Referral Tree (old system) ---");

  // Grant ENGINE_ROLE to deployer on ReferralRegistry so we can call registerReferral directly
  await registryC.grantRole(ENGINE_ROLE, deployer.address);
  console.log("   ENGINE_ROLE granted to deployer on ReferralRegistry");

  const registrySeedABI = ["function registerReferral(address, address) external", "function directReferrer(address) view returns (address)"];
  const registrySeed = new ethers.Contract(registryAddr, registrySeedABI, deployer);

  // Determine referrer for each user: prefer old referral system (more complete)
  // Old system has 123 registrations vs 91 in current
  const userReferrerMap = new Map<string, string>();
  for (const u of backup.users) {
    let referrer: string | null = null;
    // Try old referral system first (more complete)
    if (u.referral_old?.registered && u.referral_old?.referrer) {
      referrer = u.referral_old.referrer;
    }
    // Fall back to current referral system
    if (!referrer && u.referral_current?.registered && u.referral_current?.referrer) {
      referrer = u.referral_current.referrer;
    }
    // Fall back to top-level referrer field
    if (!referrer && u.referrer) {
      referrer = u.referrer;
    }
    userReferrerMap.set(u.address.toLowerCase(), referrer || "");
  }

  // Root users = those with no referrer
  const rootUsers = backup.users.filter((u: any) => !userReferrerMap.get(u.address.toLowerCase()));
  const referredUsers = backup.users.filter((u: any) => userReferrerMap.get(u.address.toLowerCase()));

  console.log(`   Root users (no referrer): ${rootUsers.length}`);
  console.log(`   Referred users: ${referredUsers.length}`);

  // Build a set of all known addresses for validation
  const allAddresses = new Set(backup.users.map((u: any) => u.address.toLowerCase()));

  // Topological sort: process users whose referrer is either a root user or already registered
  let registered = new Set<string>();
  rootUsers.forEach((u: any) => registered.add(u.address.toLowerCase()));

  let pending = [...referredUsers];
  let pass = 0;
  let totalRegistered = 0;

  while (pending.length > 0) {
    pass++;
    const stillPending: any[] = [];

    for (const user of pending) {
      const userAddr = user.address;
      const referrerAddr = userReferrerMap.get(userAddr.toLowerCase())!;

      // Check if referrer is already registered (or is a root user / external address)
      const referrerLower = referrerAddr.toLowerCase();
      const isKnownRoot = registered.has(referrerLower);
      const isExternal = !allAddresses.has(referrerLower);

      if (isKnownRoot || isExternal) {
        try {
          await registrySeed.registerReferral(userAddr, referrerAddr);
          registered.add(userAddr.toLowerCase());
          totalRegistered++;
        } catch (e: any) {
          // Already registered or other error — skip
          if (!e.message.includes("AlreadyRegistered")) {
            console.log(`   WARN: Failed to register ${userAddr}: ${e.message.substring(0, 80)}`);
          }
        }
      } else {
        stillPending.push(user);
      }
    }

    pending = stillPending;
    if (pass > 30) break; // Safety limit
  }

  console.log(`   Registered ${totalRegistered} referral relationships in ${pass} passes`);

  // --- 3b. Seed Stakes (FULL amounts, NO cap, current engine only — oldV1 is duplicate) ---
  console.log("\n--- 3b: Seeding Stakes (full amounts, no cap, current engine only) ---");

  // IMPORTANT: investmentEngine_oldV1 deposits are the SAME deposits that were migrated
  // to the current engine. Adding both would double-count. Only use investmentEngine.activeDeposit.
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
    // Use ONLY current engine activeDeposit (oldV1 is a duplicate — already migrated)
    const currentDeposit = parseFloat(user.investmentEngine?.activeDeposit || "0");

    if (currentDeposit <= 0) { skipped++; continue; }

    const amount = ethers.parseUnits(currentDeposit.toFixed(6), 6);

    // Determine tier: 1 if < $2,500, 2 if >= $2,500
    const tier = currentDeposit >= 2500 ? 2 : 1;

    // Get earnings from current engine (combinedEarnings)
    const earnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    const earningsAmount = ethers.parseUnits(earnings.toFixed(6), 6);

    try {
      await engineC.adminSeedStake(user.address, amount, tier, earningsAmount);
      totalSeeded++;
      totalAmount += amount;
      totalEarningsSeeded += earningsAmount;

      // Also seed totalClaimed so frontend shows correct claimed amount
      if (earnings > 0) {
        await engineC.adminSeedClaimed(user.address, earningsAmount);
      }
    } catch (e: any) {
      console.log(`   WARN: Failed to seed stake for ${user.address.substring(0, 12)}...: ${e.message.substring(0, 100)}`);
      skipped++;
    }
  }

  console.log(`   Seeded ${totalSeeded} stakes, skipped ${skipped}`);
  console.log(`   Total staked: ${ethers.formatUnits(totalAmount, 6)} USDT`);
  console.log(`   Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 6)} USDT`);

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
  console.log(`   totalActiveStakes: ${ethers.formatUnits(totalActive, 6)} USDT`);
  console.log(`   totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 6)} USDT`);

  // Check referral count
  const regViewABI = ["function totalRegistered() view returns (uint256)"];
  const regView = new ethers.Contract(registryAddr, regViewABI, deployer);
  // totalRegistered might not exist — try anyway
  try {
    const totalReg = await regView.totalRegistered();
    console.log(`   totalRegistered: ${totalReg}`);
  } catch {
    console.log("   (totalRegistered not available on ReferralRegistry)");
  }

  // =====================================================
  // PHASE 4: UPDATE .env.local
  // =====================================================
  console.log("\n========== PHASE 4: UPDATE .env.local ==========");

  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  const updates: Record<string, string> = {
    "NEXT_PUBLIC_USDT_ADDRESS": usdtAddr,
    "NEXT_PUBLIC_OSLO_TOKEN_ADDRESS": osloAddr,
    "NEXT_PUBLIC_OSLO_DEX_ADDRESS": dexAddr,
    "NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS": engineAddr,
    "NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS": registryAddr,
    "NEXT_PUBLIC_REWARD_VAULT_ADDRESS": vaultAddr,
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
  console.log("   .env.local updated with all new contract addresses");

  // =====================================================
  // SUMMARY
  // =====================================================
  console.log("\n========================================");
  console.log("FULL DEPLOYMENT + SEEDING COMPLETE");
  console.log("========================================");
  console.log("MockUSDT:          ", usdtAddr);
  console.log("OsloToken:         ", osloAddr);
  console.log("OsloDEX:           ", dexAddr);
  console.log("ReferralRegistry:  ", registryAddr);
  console.log("RewardVault:       ", vaultAddr);
  console.log("LevelIncomeSystem: ", levelAddr);
  console.log("InvestmentEngine:  ", engineAddr);
  console.log("LeadershipBonus:   ", lbAddr);
  console.log("OsloDAO:           ", daoAddr);
  console.log("========================================");
  console.log(`Seeded: ${totalSeeded} stakes, ${totalRegistered} referrals`);
  console.log(`Total staked: ${ethers.formatUnits(totalAmount, 6)} USDT`);
  console.log(`Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 6)} USDT`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
