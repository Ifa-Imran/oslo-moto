import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Fix incomplete seeding — register missing users and seed missing totalClaimed.
 *
 * Issues found:
 * 1. 7 users not registered in ReferralRegistry (3 roots + 4 referred)
 * 2. 2 users missing totalClaimed in InvestmentEngine
 */

const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const ENGINE_ADDR = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

// Sentinel address for root users (no referrer) — same as used by register(address(0))
const ROOT_SENTINEL = "0x0000000000000000000000000000000000000001";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing incomplete seeding with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));

  const registryABI = [
    "function registerReferral(address, address) external",
    "function isRegistered(address) view returns (bool)",
    "function directReferrer(address) view returns (address)",
  ];
  const engineABI = [
    "function adminSeedClaimed(address, uint256) external",
    "function totalClaimed(address) view returns (uint256)",
  ];

  const registry = new ethers.Contract(REGISTRY_ADDR, registryABI, deployer);
  const engine = new ethers.Contract(ENGINE_ADDR, engineABI, deployer);

  // Build referrer map from backup
  const userReferrerMap = new Map<string, string>();
  for (const u of backup.users) {
    let referrer: string | null = null;
    if (u.referral_old?.registered && u.referral_old?.referrer) referrer = u.referral_old.referrer;
    if (!referrer && u.referral_current?.registered && u.referral_current?.referrer) referrer = u.referral_current.referrer;
    if (!referrer && u.referrer) referrer = u.referrer;
    userReferrerMap.set(u.address.toLowerCase(), referrer || "");
  }

  // =====================================================
  // PHASE 1: Register missing users
  // =====================================================
  console.log("\n========== PHASE 1: Register Missing Users ==========");

  let registered = 0;
  let skipped = 0;

  for (const user of backup.users) {
    const addr = user.address;
    const isReg = await registry.isRegistered(addr);
    if (isReg) {
      skipped++;
      continue;
    }

    const referrer = userReferrerMap.get(addr.toLowerCase()) || "";
    const isRoot = !referrer;

    try {
      if (isRoot) {
        // Root user — register with sentinel address(1)
        console.log(`  Registering ROOT: ${addr}`);
        await registry.registerReferral(addr, ROOT_SENTINEL);
        registered++;
      } else {
        // Referred user — check if referrer is registered on-chain
        const referrerReg = await registry.isRegistered(referrer);
        if (!referrerReg) {
          // Referrer not registered yet — register referrer as root first
          console.log(`  Registering referrer first: ${referrer}`);
          await registry.registerReferral(referrer, ROOT_SENTINEL);
          registered++;
        }
        console.log(`  Registering: ${addr} (referrer: ${referrer})`);
        await registry.registerReferral(addr, referrer);
        registered++;
      }
    } catch (e: any) {
      console.log(`  ERROR: Failed to register ${addr}: ${e.message?.substring(0, 120)}`);
    }
  }

  console.log(`\n  Registered: ${registered}, Already registered: ${skipped}`);

  // =====================================================
  // PHASE 2: Seed missing totalClaimed
  // =====================================================
  console.log("\n========== PHASE 2: Seed Missing totalClaimed ==========");

  let claimedSeeded = 0;
  for (const user of backup.users) {
    const expectedEarnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    if (expectedEarnings <= 0) continue;

    const addr = user.address;
    const onChainClaimed = await engine.totalClaimed(addr);
    const expectedClaimed = ethers.parseUnits(expectedEarnings.toString(), 18);

    if (onChainClaimed !== expectedClaimed) {
      console.log(`  Seeding totalClaimed for ${addr}: ${expectedEarnings} USDT`);
      try {
        await engine.adminSeedClaimed(addr, expectedClaimed);
        claimedSeeded++;
      } catch (e: any) {
        console.log(`  ERROR: ${e.message?.substring(0, 120)}`);
      }
    }
  }

  console.log(`\n  totalClaimed seeded: ${claimedSeeded}`);

  // =====================================================
  // PHASE 3: Final verification
  // =====================================================
  console.log("\n========== PHASE 3: Final Verification ==========");

  let totalRegistered = 0;
  let totalUnregistered = 0;
  let totalStaked = 0;
  let totalClaimed = 0;
  let mismatches = 0;

  for (const user of backup.users) {
    const addr = user.address;
    const isReg = await registry.isRegistered(addr);
    if (isReg) totalRegistered++;
    else {
      totalUnregistered++;
      console.log(`  STILL UNREGISTERED: ${addr}`);
    }

    const expectedEarnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    if (expectedEarnings > 0) {
      const onChainClaimed = await engine.totalClaimed(addr);
      const expectedClaimed = ethers.parseUnits(expectedEarnings.toString(), 18);
      if (onChainClaimed !== expectedClaimed) {
        mismatches++;
        console.log(`  CLAIMED MISMATCH: ${addr} — expected: ${expectedEarnings}, onChain: ${ethers.formatUnits(onChainClaimed, 18)}`);
      }
    }
  }

  console.log(`\n  Registered: ${totalRegistered}/${backup.users.length}`);
  console.log(`  Unregistered: ${totalUnregistered}`);
  console.log(`  Claimed mismatches: ${mismatches}`);

  if (totalUnregistered === 0 && mismatches === 0) {
    console.log("\n  ✅ ALL DATA SEEDED SUCCESSFULLY!");
  } else {
    console.log("\n  ⚠️  SOME ISSUES REMAIN — check output above.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
