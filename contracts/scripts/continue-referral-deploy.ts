import { ethers } from "hardhat";

/**
 * Continue referral redeployment — migrate users and update pointers.
 * The new referral is already deployed and configured.
 */

const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO_TOKEN = "0x42062C7dD20Fc6a17987763E8db0d0acDDBEa6d5";
const OSLO_DEX = "0xe3368093Cf0Ed990bb628C261F5e1A483DA74Ee3";
const INVESTMENT_ENGINE = "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9";
const OLD_REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const NEW_REFERRAL = "0xFa55A91C36f1ccdB83B13114ebFbC16F6C7e4FBe";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("CONTINUE: Migrate Users & Update Pointers");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("New Referral:", NEW_REFERRAL, "\n");

  const oldRef = await ethers.getContractAt("OSLOReferral", OLD_REFERRAL);
  const newRef = await ethers.getContractAt("OSLOReferral", NEW_REFERRAL);

  // ─── 1. Read users by traversing referral tree (no events needed) ─────
  console.log("1. Reading registered users by traversing tree...");

  const users: string[] = [];
  const referrers: string[] = [];
  const levels: bigint[] = [];

  // BFS traversal starting from deployer (root)
  const queue: string[] = [deployer.address];
  const visited = new Set<string>();

  // Also check known addresses
  const knownAddresses = [
    "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c",
    "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69",
  ];
  for (const a of knownAddresses) {
    if (!queue.includes(a)) queue.push(a);
  }

  while (queue.length > 0) {
    const addr = queue.shift()!;
    if (visited.has(addr.toLowerCase())) continue;
    visited.add(addr.toLowerCase());

    try {
      const info = await oldRef.userInfo(addr);
      if (info.registered) {
        users.push(addr);
        referrers.push(info.referrer);
        levels.push(info.unlockedLevels);
        console.log(`   ✓ ${addr} (ref: ${info.referrer.slice(0,10)}..., lvl: ${info.unlockedLevels})`);

        // Add direct referrals to queue
        try {
          const directs = await oldRef.getDirectReferrals(addr);
          for (const d of directs) {
            if (!visited.has(d.toLowerCase())) queue.push(d);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  console.log(`   Total users found: ${users.length}`);

  if (users.length > 0) {
    console.log("\n2. Migrating users to new referral...");
    const tx = await newRef.migrateUsers(users, referrers, levels);
    await tx.wait();
    console.log(`   ✓ Migrated ${users.length} users`);
  } else {
    console.log("   ⚠ No users found to migrate");
  }

  // ─── 3. Update IE to point to new referral ─────────────────────────────
  console.log("\n3. Updating InvestmentEngine → new referral...");
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);
  let tx = await ie.setReferral(NEW_REFERRAL);
  await tx.wait();
  console.log("   ✓ IE referral updated");

  // ─── 4. Update DEX referral pointer ────────────────────────────────────
  console.log("\n4. Updating DEX → new referral...");
  const dex = await ethers.getContractAt("OSLODEX", OSLO_DEX);
  try {
    tx = await dex.forceSetReferralContract(NEW_REFERRAL);
    await tx.wait();
    console.log("   ✓ DEX referral updated");
  } catch (e: any) {
    console.log("   ⚠ DEX update skipped:", e.message?.slice(0, 60));
  }

  // ─── 5. Seed OSLO ─────────────────────────────────────────────────────
  console.log("\n5. Seeding OSLO to new referral...");
  const osloAbi = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO_TOKEN, osloAbi, deployer);
  const deployerBal = await oslo.balanceOf(deployer.address);
  const seedAmount = ethers.parseEther("500000");
  if (deployerBal >= seedAmount) {
    tx = await oslo.transfer(NEW_REFERRAL, seedAmount);
    await tx.wait();
    console.log("   ✓ Sent 500,000 OSLO");
  } else {
    console.log("   ⚠ Deployer OSLO balance too low:", ethers.formatEther(deployerBal));
    // Try a smaller amount
    if (deployerBal > 0n) {
      tx = await oslo.transfer(NEW_REFERRAL, deployerBal);
      await tx.wait();
      console.log("   ✓ Sent", ethers.formatEther(deployerBal), "OSLO (all available)");
    }
  }

  // ─── 6. Verify ────────────────────────────────────────────────────────
  console.log("\n6. Verification...");
  const newTotal = await newRef.totalRegistered();
  const ieRef = await ie.referral();
  console.log("   New referral totalRegistered:", newTotal.toString());
  console.log("   IE.referral():", ieRef);
  console.log("   Expected:", NEW_REFERRAL);
  console.log("   Match:", ieRef.toLowerCase() === NEW_REFERRAL.toLowerCase() ? "✓" : "✗");

  console.log("\n" + "=".repeat(60));
  console.log("DONE! Update frontend:");
  console.log(`  referral: "${NEW_REFERRAL}"`);
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
