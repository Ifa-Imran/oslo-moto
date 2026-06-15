import { ethers } from "hardhat";

/**
 * Redeploy OSLOReferral with unsponsored-account fix.
 * 
 * What changed:
 * 1. register() — requires referrer != address(0) (no orphan registrations)
 * 2. distributeReferralCommission() — skips uplines with referrer == address(0)
 * 3. claimReferralRewards() — blocks unsponsored accounts from claiming
 */

// Current deployed addresses
const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO_TOKEN = "0x42062C7dD20Fc6a17987763E8db0d0acDDBEa6d5";
const OSLO_DEX = "0xe3368093Cf0Ed990bb628C261F5e1A483DA74Ee3";
const INVESTMENT_ENGINE = "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9";
const OLD_REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("=".repeat(60));
  console.log("REDEPLOY OSLOReferral — Unsponsored Account Fix");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB\n");

  // ─── 1. Deploy new OSLOReferral ────────────────────────────────────────
  console.log("1. Deploying new OSLOReferral...");
  const ReferralFactory = await ethers.getContractFactory("OSLOReferral");
  const newReferral = await ReferralFactory.deploy(USDT, OSLO_TOKEN);
  await newReferral.waitForDeployment();
  const NEW_REFERRAL = await newReferral.getAddress();
  console.log("   New OSLOReferral:", NEW_REFERRAL);

  // ─── 2. Configure new referral ─────────────────────────────────────────
  console.log("\n2. Configuring new referral...");
  let tx = await newReferral.configure(INVESTMENT_ENGINE, OSLO_DEX, deployer.address);
  await tx.wait();
  console.log("   Configured (IE, DEX, timelock=deployer)");

  // ─── 3. Migrate users from old referral ────────────────────────────────
  console.log("\n3. Migrating users from old referral...");
  const oldRef = await ethers.getContractAt("OSLOReferral", OLD_REFERRAL);
  const totalRegistered = await oldRef.totalRegistered();
  console.log("   Total registered in old contract:", totalRegistered.toString());

  // Read registration events from old contract to rebuild tree
  const filter = oldRef.filters.UserRegistered();
  const events = await oldRef.queryFilter(filter, 0, "latest");
  console.log("   Found", events.length, "UserRegistered events");

  if (events.length > 0) {
    // Process in batches of 50
    const BATCH_SIZE = 50;
    const users: string[] = [];
    const referrers: string[] = [];
    const levels: bigint[] = [];

    for (const ev of events) {
      const log = ev as unknown as { args: any[] };
      const user = log.args[0];
      const referrer = log.args[1];
      const info = await oldRef.userInfo(user);
      users.push(user);
      referrers.push(referrer);
      levels.push(info.unlockedLevels);
    }

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batchUsers = users.slice(i, i + BATCH_SIZE);
      const batchReferrers = referrers.slice(i, i + BATCH_SIZE);
      const batchLevels = levels.slice(i, i + BATCH_SIZE);

      tx = await newReferral.migrateUsers(batchUsers, batchReferrers, batchLevels);
      await tx.wait();
      console.log(`   Migrated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchUsers.length} users`);
    }
  }

  // ─── 4. Update IE to point to new referral ─────────────────────────────
  console.log("\n4. Updating InvestmentEngine referral pointer...");
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);
  tx = await ie.setReferral(NEW_REFERRAL);
  await tx.wait();
  console.log("   IE now points to new referral");

  // ─── 5. Update DEX referral pointer ────────────────────────────────────
  console.log("\n5. Updating DEX referral pointer...");
  const dex = await ethers.getContractAt("OSLODEX", OSLO_DEX);
  try {
    tx = await dex.forceSetReferralContract(NEW_REFERRAL);
    await tx.wait();
    console.log("   DEX now points to new referral");
  } catch (e: any) {
    console.log("   DEX referral update skipped:", e.message?.slice(0, 60));
  }

  // ─── 6. Send OSLO to new referral for commission payouts ───────────────
  console.log("\n6. Seeding OSLO to new referral for commission payouts...");
  const osloAbi = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO_TOKEN, osloAbi, deployer);
  const seedAmount = ethers.parseEther("500000"); // 500k OSLO
  const deployerOsloBal = await oslo.balanceOf(deployer.address);
  if (deployerOsloBal >= seedAmount) {
    tx = await oslo.transfer(NEW_REFERRAL, seedAmount);
    await tx.wait();
    console.log("   Sent 500,000 OSLO to new referral");
  } else {
    console.log("   SKIP: Deployer OSLO balance too low:", ethers.formatEther(deployerOsloBal));
  }

  // ─── 7. Print summary ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("New OSLOReferral:", NEW_REFERRAL);
  console.log("Old OSLOReferral:", OLD_REFERRAL, "(deprecated)");
  console.log("\nUpdate frontend/src/lib/contracts-testnet.ts:");
  console.log(`  referral: "${NEW_REFERRAL}"`);
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
