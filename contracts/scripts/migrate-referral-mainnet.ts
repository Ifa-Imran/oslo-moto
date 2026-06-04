import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Migrate all 79 users from testnet-final-snapshot.json to the mainnet OSLOReferral contract.
 * The contract's migrateUsers() skips duplicates, so it's safe to send all users.
 * Must be run BEFORE completeSetup() is called on the referral contract.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Load snapshot
  const snapshotPath = path.join(__dirname, "../data/testnet-final-snapshot.json");
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);

  // Check admin status
  const admin = await referral.admin();
  const setupComplete = await referral.setupComplete();
  console.log("  Referral admin:", admin);
  console.log("  Setup complete:", setupComplete);

  if (setupComplete) {
    console.error("ERROR: setupComplete is true — cannot migrate users!");
    process.exit(1);
  }
  if (admin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error(`ERROR: Deployer (${deployer.address}) is not the admin (${admin})`);
    process.exit(1);
  }

  // Check current registration count
  const currentRegistered = await referral.totalRegistered();
  console.log(`  Currently registered: ${currentRegistered}`);

  // Build migration arrays from snapshot users
  const users: string[] = [];
  const referrers: string[] = [];
  const unlockedLevels: number[] = [];

  // Sort: users with address(0) referrer first, then others
  // This ensures parents are registered before children (though migrateUsers doesn't enforce this)
  const sortedUsers = [...snapshot.users].sort((a: any, b: any) => {
    const aIsRoot = a.referrer === "0x0000000000000000000000000000000000000000";
    const bIsRoot = b.referrer === "0x0000000000000000000000000000000000000000";
    if (aIsRoot && !bIsRoot) return -1;
    if (!aIsRoot && bIsRoot) return 1;
    return 0;
  });

  for (const user of sortedUsers) {
    users.push(user.address);
    referrers.push(user.referrer);
    unlockedLevels.push(user.unlockedLevels);
  }

  console.log(`\n  Total users to migrate: ${users.length}`);

  // Check which are already registered
  let alreadyRegistered = 0;
  for (const addr of users) {
    const isReg = await referral.isRegistered(addr);
    if (isReg) alreadyRegistered++;
  }
  console.log(`  Already registered on-chain: ${alreadyRegistered}`);
  console.log(`  New users to register: ${users.length - alreadyRegistered}`);

  if (users.length - alreadyRegistered === 0) {
    console.log("  All users already registered. Nothing to do.");
    return;
  }

  // Migrate in batches of 20
  const BATCH_SIZE = 20;
  const txOpts = { gasLimit: 3000000 };

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const end = Math.min(i + BATCH_SIZE, users.length);
    const batchUsers = users.slice(i, end);
    const batchReferrers = referrers.slice(i, end);
    const batchLevels = unlockedLevels.slice(i, end);

    const tx = await referral.migrateUsers(batchUsers, batchReferrers, batchLevels, txOpts);
    await tx.wait();
    console.log(`  ✓ Migrated batch ${i + 1}-${end} (tx: ${tx.hash})`);
  }

  // Verify final count
  const finalRegistered = await referral.totalRegistered();
  console.log(`\n  Final registered count: ${finalRegistered}`);

  // Now migrate referral earnings for users with non-zero values
  const earningsUsers: string[] = [];
  const totalEarned: bigint[] = [];
  const referralRewards: bigint[] = [];

  for (const user of snapshot.users) {
    const earned = parseFloat(user.totalEarned || "0");
    const rewards = parseFloat(user.referralRewards || "0");
    if (earned > 0 || rewards > 0) {
      earningsUsers.push(user.address);
      totalEarned.push(ethers.parseEther(user.totalEarned || "0"));
      referralRewards.push(ethers.parseEther(user.referralRewards || "0"));
    }
  }

  if (earningsUsers.length > 0) {
    console.log(`\n  Migrating earnings for ${earningsUsers.length} users...`);
    for (let i = 0; i < earningsUsers.length; i += BATCH_SIZE) {
      const end = Math.min(i + BATCH_SIZE, earningsUsers.length);
      const tx = await referral.migrateEarnings(
        earningsUsers.slice(i, end),
        totalEarned.slice(i, end),
        referralRewards.slice(i, end),
        txOpts
      );
      await tx.wait();
      console.log(`  ✓ Earnings batch ${i + 1}-${end}`);
    }
  }

  console.log("\n═══ Referral Migration Complete ═══");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
