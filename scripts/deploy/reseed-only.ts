import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Re-seed only script — uses already-deployed contracts.
 * Run this when contracts are deployed but data seeding failed/incomplete.
 * Only seeds referral tree + stakes (no deployment, no wiring).
 *
 * Usage: npx hardhat run scripts/deploy/reseed-only.ts --network bscTestnet
 */

// Already-deployed contract addresses (from latest deployment)
const ENGINE_ADDR = "0xA7c0f3AA00CC7203D616520cbF995B77D88F1267";
const REGISTRY_ADDR = "0xab51b39FdF5B32cDE4e1189A00F60491A35bDc42";

// Wallet addresses
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";

// Backup file
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Re-seeding with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("Engine:", ENGINE_ADDR);
  console.log("Registry:", REGISTRY_ADDR);

  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

  // Contract interfaces
  const registryABI = [
    "function grantRole(bytes32, address) external",
    "function registerReferral(address, address) external",
    "function directReferrer(address) view returns (address)",
  ];
  const engineABI = [
    "function grantRole(bytes32, address) external",
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function adminSeedClaimed(address, uint256) external",
    "function totalUsers() view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
    "function totalProtocolTurnover() view returns (uint256)",
  ];

  const registry = new ethers.Contract(REGISTRY_ADDR, registryABI, deployer);
  const engine = new ethers.Contract(ENGINE_ADDR, engineABI, deployer);

  // Check if stakes already seeded
  const existingUsers = await engine.totalUsers();
  const stakesAlreadySeeded = existingUsers > 0n;
  if (stakesAlreadySeeded) {
    console.log(`\nNOTE: Engine already has ${existingUsers} users with stakes. Will skip stake seeding and only seed missing referrals.`);
  }

  // Grant ENGINE_ROLE to deployer on ReferralRegistry
  console.log("\nGranting ENGINE_ROLE to deployer on ReferralRegistry...");
  await registry.grantRole(ENGINE_ROLE, deployer.address);
  console.log("Done.");

  // Read backup
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`\nBackup: ${backup._meta.totalUsers} users, ${backup._meta.withActiveDeposit} with deposits`);

  // =====================================================
  // PHASE 1: SEED REFERRAL TREE (old system — more complete)
  // =====================================================
  console.log("\n========== SEED REFERRAL TREE ==========");

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

  console.log(`Root users: ${rootUsers.length}, Referred users: ${referredUsers.length}`);

  const allAddresses = new Set(backup.users.map((u: any) => u.address.toLowerCase()));
  let registered = new Set<string>();
  rootUsers.forEach((u: any) => registered.add(u.address.toLowerCase()));

  // Pre-check: query on-chain for users already registered from previous runs
  // This prevents topological sort from stalling when AlreadyRegistered is encountered
  const regCheckABI = ["function directReferrer(address) view returns (address)"];
  const regCheck = new ethers.Contract(REGISTRY_ADDR, regCheckABI, deployer);
  for (const u of backup.users) {
    try {
      const existing = await regCheck.directReferrer(u.address);
      if (existing !== ethers.ZeroAddress) {
        registered.add(u.address.toLowerCase());
      }
    } catch {}
  }
  console.log(`Pre-checked on-chain: ${registered.size} users already registered (including roots)`);

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
          const tx = await registry.registerReferral(userAddr, referrerAddr);
          await tx.wait();
          registered.add(userAddr.toLowerCase());
          totalRegistered++;
        } catch (e: any) {
          // AlreadyRegistered (0x3a81d6fc) — user is already on-chain, add to tracking set
          if (e.message.includes("0x3a81d6fc") || e.message.includes("AlreadyRegistered")) {
            registered.add(userAddr.toLowerCase());
          } else if (!e.message.includes("insufficient funds")) {
            console.log(`  WARN: Failed ${userAddr.substring(0, 12)}...: ${e.message.substring(0, 80)}`);
          }
          if (e.message.includes("insufficient funds")) {
            console.log(`  OUT OF BNB! Stopping. ${totalRegistered} referrals registered so far.`);
            console.log(`  Fund wallet ${deployer.address} with more BNB and re-run.`);
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

  console.log(`Registered ${totalRegistered} referral relationships in ${pass} passes`);

  // =====================================================
  // PHASE 2: SEED STAKES (current engine only, NO oldV1, NO cap)
  // =====================================================
  console.log("\n========== SEED STAKES ==========");

  let totalSeeded = 0;
  let totalAmount = 0n;
  let skipped = 0;
  let totalEarningsSeeded = 0n;

  if (stakesAlreadySeeded) {
    console.log("Skipping stake seeding — already done.");
  } else {
  // IMPORTANT: investmentEngine_oldV1 deposits are duplicates (migrated to current engine).
  // Only use investmentEngine.activeDeposit to avoid double-counting.
  const usersWithDeposits = backup.users.filter((u: any) => {
    const cur = parseFloat(u.investmentEngine?.activeDeposit || "0");
    return cur > 0;
  });
  console.log(`Users with deposits: ${usersWithDeposits.length}`);

  for (const user of usersWithDeposits) {
    const currentDeposit = parseFloat(user.investmentEngine?.activeDeposit || "0");
    if (currentDeposit <= 0) { skipped++; continue; }

    const amount = ethers.parseUnits(currentDeposit.toFixed(6), 6);
    const tier = currentDeposit >= 2500 ? 2 : 1;
    const earnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    const earningsAmount = ethers.parseUnits(earnings.toFixed(6), 6);

    try {
      const tx1 = await engine.adminSeedStake(user.address, amount, tier, earningsAmount);
      await tx1.wait();
      totalSeeded++;
      totalAmount += amount;
      totalEarningsSeeded += earningsAmount;

      if (earnings > 0) {
        const tx2 = await engine.adminSeedClaimed(user.address, earningsAmount);
        await tx2.wait();
      }
    } catch (e: any) {
      if (e.message.includes("insufficient funds")) {
        console.log(`  OUT OF BNB! Stopped at user ${totalSeeded + 1}/${usersWithDeposits.length}`);
        console.log(`  Fund wallet ${deployer.address} with more BNB and re-run.`);
        break;
      }
      console.log(`  WARN: Failed ${user.address.substring(0, 12)}...: ${e.message.substring(0, 80)}`);
      skipped++;
    }
  }

  console.log(`Seeded ${totalSeeded} stakes, skipped ${skipped}`);
  console.log(`Total staked: ${ethers.formatUnits(totalAmount, 6)} USDT`);
  console.log(`Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 6)} USDT`);
  } // end if !stakesAlreadySeeded

  // =====================================================
  // VERIFY
  // =====================================================
  console.log("\n========== VERIFICATION ==========");
  const totalUsers = await engine.totalUsers();
  const totalActive = await engine.totalActiveStakes();
  const totalTurnover = await engine.totalProtocolTurnover();
  console.log(`totalUsers: ${totalUsers}`);
  console.log(`totalActiveStakes: ${ethers.formatUnits(totalActive, 6)} USDT`);
  console.log(`totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 6)} USDT`);

  console.log("\n========================================");
  console.log("RE-SEED COMPLETE");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
