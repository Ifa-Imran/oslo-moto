import { ethers } from "hardhat";

/**
 * Diagnose yield generation issues for test accounts.
 * Checks: deposits, pending rewards, OSLO reserves, DEX pricing, timestamps.
 */

const INVESTMENT_ENGINE = "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9";
const OSLO_TOKEN = "0x42062C7dD20Fc6a17987763E8db0d0acDDBEa6d5";
const OSLO_DEX = "0xe3368093Cf0Ed990bb628C261F5e1A483DA74Ee3";
const REFERRAL = "0xFa55A91C36f1ccdB83B13114ebFbC16F6C7e4FBe";

// Test accounts to check
const TEST_ACCOUNTS = [
  "0x47f8160e3C854b4b4679579b99726E5E81736B7f", // deployer
  "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c", // testWallet
  "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69", // reported wallet
  "0xcFdDCd38F6789f9BdbBD26eb0b68c4CCe8d9FeD1",
  "0x1c6BAb379a95A4E268215eE4D223F59f1810635F",
  "0xD0E00Ce75774c06fd300E01Ae7e75e88084e3B89",
  "0xBD3bC2d090f49EF631e29b3D1226451c483Dc4d8",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("YIELD GENERATION DIAGNOSTIC");
  console.log("=".repeat(70));

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);
  const osloToken = await ethers.getContractAt("IERC20", OSLO_TOKEN);
  const dex = await ethers.getContractAt("OSLODEX", OSLO_DEX);

  // ─── Global State ──────────────────────────────────────────────────────
  console.log("\n┌─── GLOBAL STATE ───────────────────────────────────────────────┐");
  const launchTs = await ie.launchTimestamp();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const elapsedDays = Number(now - launchTs) / 86400;
  console.log(`│ Launch Timestamp:     ${launchTs} (${new Date(Number(launchTs) * 1000).toISOString()})`);
  console.log(`│ Current Time:         ${now}`);
  console.log(`│ Elapsed Since Launch: ${elapsedDays.toFixed(2)} days`);
  console.log(`│ Deposits Paused:      ${await ie.depositsPaused()}`);
  console.log(`│ Setup Complete:       ${await ie.setupComplete()}`);
  console.log(`│ Min Claim Threshold:  $${ethers.formatEther(await ie.minClaimThreshold())}`);
  console.log(`│ Total Deposited:      $${ethers.formatEther(await ie.totalDeposited())}`);
  console.log(`│ Total Rewards Paid:   $${ethers.formatEther(await ie.totalRewardsPaid())}`);

  // IE OSLO balance (reward reserve)
  const ieOsloBal = await osloToken.balanceOf(INVESTMENT_ENGINE);
  console.log(`│ IE OSLO Reserve:      ${ethers.formatEther(ieOsloBal)} OSLO`);

  // DEX health
  try {
    const testConversion = await dex.getUSDTForOSLOOutput(ethers.parseEther("1"));
    console.log(`│ DEX: $1 USDT = ${ethers.formatEther(testConversion)} OSLO`);
  } catch (e: any) {
    console.log(`│ DEX PRICING ERROR:    ${e.message?.slice(0, 60)}`);
  }

  // Referral pointer
  const currentRef = await ie.referral();
  console.log(`│ IE.referral:          ${currentRef}`);
  console.log(`│ Expected referral:    ${REFERRAL}`);
  console.log(`│ Match:                ${currentRef.toLowerCase() === REFERRAL.toLowerCase() ? '✓' : '✗ MISMATCH!'}`);
  console.log(`└────────────────────────────────────────────────────────────────┘`);

  // ─── Per-Account Diagnostics ────────────────────────────────────────────
  console.log("\n┌─── PER-ACCOUNT DIAGNOSTICS ────────────────────────────────────┐");

  for (const account of TEST_ACCOUNTS) {
    console.log(`\n  ▸ ${account}`);

    const userInfo = await ie.users(account);
    const depositCount = Number(userInfo.depositCount);
    console.log(`    Active Deposit: $${ethers.formatEther(userInfo.totalActiveDeposit)}`);
    console.log(`    Deposit Count:  ${depositCount}`);
    console.log(`    Combined Earn:  $${ethers.formatEther(userInfo.totalCombinedEarnings)}`);

    if (depositCount === 0) {
      console.log(`    ⚠ NO DEPOSITS — Cannot generate yield`);
      continue;
    }

    // Check each deposit
    for (let i = 0; i < Math.min(depositCount, 5); i++) {
      try {
        const dep = await ie.userDeposits(account, i);
        const depositAmt = dep.amount;
        const active = dep.active;
        const lastClaim = dep.lastClaimTime;
        const maxRet = dep.maxReturn;
        const totalClaimed = dep.totalClaimed;
        const dailyRate = dep.dailyRate;
        const depositTime = dep.depositTime;

        const timeSinceLastClaim = Number(now - lastClaim);
        const timeSinceDeposit = Number(now - depositTime);

        console.log(`    ── Deposit #${i}:`);
        console.log(`       Amount:          $${ethers.formatEther(depositAmt)}`);
        console.log(`       Active:          ${active}`);
        console.log(`       Daily Rate:      ${Number(dailyRate) / 100}%`);
        console.log(`       Deposit Time:    ${new Date(Number(depositTime) * 1000).toISOString()} (${(timeSinceDeposit / 86400).toFixed(2)} days ago)`);
        console.log(`       Last Claim:      ${new Date(Number(lastClaim) * 1000).toISOString()} (${(timeSinceLastClaim / 86400).toFixed(2)} days ago)`);
        console.log(`       Total Claimed:   $${ethers.formatEther(totalClaimed)} / $${ethers.formatEther(maxRet)} (3X cap)`);

        if (!active) {
          console.log(`       ⚠ INACTIVE — deposit is capped or deactivated`);
          continue;
        }

        // Try to calculate pending rewards
        try {
          const pending = await ie.getPendingRewards(account, i);
          console.log(`       PENDING YIELD:   $${ethers.formatEther(pending)}`);

          if (pending === 0n) {
            if (timeSinceLastClaim < 60) {
              console.log(`       ⚠ Too recent — claimed less than 60s ago`);
            } else {
              console.log(`       ❌ ZERO YIELD despite time elapsed — BUG!`);
            }
          } else if (pending < ethers.parseEther("1")) {
            console.log(`       ⚠ Below $1 minimum claim threshold`);
          } else {
            // Check if claim would succeed
            const osloNeeded = await dex.getUSDTForOSLOOutput(pending);
            console.log(`       OSLO Needed:     ${ethers.formatEther(osloNeeded)} OSLO`);
            if (ieOsloBal < osloNeeded) {
              console.log(`       ❌ INSUFFICIENT OSLO RESERVE — claim will fail!`);
            } else {
              console.log(`       ✓ Claim would succeed`);
            }
          }
        } catch (e: any) {
          console.log(`       ❌ getPendingRewards ERROR: ${e.message?.slice(0, 80)}`);
        }
      } catch {
        console.log(`    ── Deposit #${i}: ❌ Could not read`);
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSTIC COMPLETE");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
