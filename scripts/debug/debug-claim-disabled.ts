import { ethers } from "hardhat";

/**
 * Debug script: Diagnose why the Claim Yield button is disabled.
 *
 * The frontend disables the claim button when:
 *   !claimableYield || claimableYield === 0n || isClaiming || !isActive
 *
 * This script checks ALL on-chain conditions that could cause claimableYield = 0:
 *   1. No stakes at all
 *   2. All stakes inactive
 *   3. 3X cap reached (effectiveEarnings >= cap)
 *   4. No time elapsed (stake just created)
 *   5. 365-day limit reached
 *   6. Contract paused
 *
 * Usage: npx hardhat run scripts/debug/debug-claim-disabled.ts --network bscMainnet
 */

const TARGET_WALLET = "0x69921E17EBD81B637Bd28E7935eC39Ee140871EC";
const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const REWARD_VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const LEVEL_SYSTEM_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function tier1Rates(uint256) view returns (uint16)",
  "function tier2Rates(uint256) view returns (uint16)",
];

const DEX_ABI = [
  "function getPrice() view returns (uint256)",
];

const VAULT_ABI = [
  "function osloBalance() view returns (uint256)",
];

const LEVEL_ABI = [
  "function ENGINE_ROLE() view returns (bytes32)",
  "function hasRole(bytes32, address) view returns (bool)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, signer);

  console.log("=".repeat(70));
  console.log("CLAIM DISABLED DEBUG REPORT");
  console.log("=".repeat(70));
  console.log(`Wallet:   ${TARGET_WALLET}`);
  console.log(`Time:     ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  // ---- 1. Contract status ----
  const isPaused = await engine.paused();
  console.log("\n--- 1. CONTRACT STATUS ---");
  console.log(`  Paused: ${isPaused}`);
  if (isPaused) console.log("  ❌ Contract is PAUSED — all operations blocked!");

  // ---- 2. User summary ----
  const hasStaked = await engine.hasStaked(TARGET_WALLET);
  const seededEarnings = await engine.seededEarnings(TARGET_WALLET);
  const totalClaimed = await engine.totalClaimed(TARGET_WALLET);
  const accruedYield = await engine.calculateAccruedYield(TARGET_WALLET);
  const claimableYield = await engine.getClaimableYield(TARGET_WALLET);
  const totalActiveStake = await engine.getTotalActiveStake(TARGET_WALLET);

  console.log("\n--- 2. USER SUMMARY ---");
  console.log(`  Has Staked:         ${hasStaked}`);
  console.log(`  Total Active Stake: ${ethers.formatUnits(totalActiveStake, 18)} USDT`);
  console.log(`  Seeded Earnings:   ${ethers.formatUnits(seededEarnings, 18)} USDT`);
  console.log(`  Total Claimed:     ${ethers.formatUnits(totalClaimed, 18)} USDT`);
  console.log(`  Accrued Yield:     ${ethers.formatUnits(accruedYield, 18)} USDT (total since stake start)`);
  console.log(`  Claimable Yield:   ${ethers.formatUnits(claimableYield, 18)} USDT (can claim now)`);
  console.log(`  → Frontend disables Claim button when claimableYield = 0`);

  // ---- 3. Individual stakes ----
  const stakes = await engine.getUserStakes(TARGET_WALLET);
  console.log("\n--- 3. INDIVIDUAL STAKES ---");
  console.log(`  Total stake entries: ${stakes.length}`);

  if (stakes.length === 0) {
    console.log("  ❌ NO STAKES — user has never staked!");
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    const cap = s.activeStake * 3n;
    const effectiveEarnings = s.totalEarnings + seededEarnings;
    const capUsedPct = cap > 0n ? (Number(effectiveEarnings) / Number(cap)) * 100 : 0;
    const timeElapsed = now - Number(s.stakeStartTime);
    const completeDays = Math.floor(timeElapsed / 86400);
    const remainingHours = Math.floor((timeElapsed % 86400) / 3600);

    console.log(`\n  Stake #${i + 1}:`);
    console.log(`    Active Stake:      ${ethers.formatUnits(s.activeStake, 18)} USDT`);
    console.log(`    Tier:              ${s.tier}`);
    console.log(`    Is Active:         ${s.isActive}`);
    console.log(`    Total Earnings:    ${ethers.formatUnits(s.totalEarnings, 18)} USDT (yield credited to THIS stake)`);
    console.log(`    Seeded Earnings:   ${ethers.formatUnits(seededEarnings, 18)} USDT (historical, from migration)`);
    console.log(`    Effective Earnings:${ethers.formatUnits(effectiveEarnings, 18)} USDT (totalEarnings + seededEarnings)`);
    console.log(`    3X Cap:            ${ethers.formatUnits(cap, 18)} USDT (activeStake × 3)`);
    console.log(`    Cap Used:          ${capUsedPct.toFixed(2)}%`);
    console.log(`    Stake Start:       ${new Date(Number(s.stakeStartTime) * 1000).toISOString()}`);
    console.log(`    Time Elapsed:      ${completeDays} days, ${remainingHours}h`);
    console.log(`    Day Index:         ${s.stakeDayIndex}`);

    // ---- Detailed cap analysis ----
    console.log(`\n    --- 3X CAP ANALYSIS ---`);

    if (effectiveEarnings >= cap) {
      console.log(`    ❌ 3X CAP EXCEEDED!`);
      console.log(`       Effective earnings (${ethers.formatUnits(effectiveEarnings, 18)}) >= Cap (${ethers.formatUnits(cap, 18)})`);
      console.log(`       This means getClaimableYield() returns 0 for this stake.`);
      console.log(`       The contract skips stakes where effectiveEarnings >= cap.`);
      console.log(`       Remaining cap space: 0 USDT`);

      if (s.isActive) {
        console.log(`\n       ⚠ NOTE: Stake is still marked isActive=true!`);
        console.log(`       The cap was exceeded by SEEDED earnings (migration), not by claiming.`);
        console.log(`       The stake was never deactivated because the cap check in claimYield()`);
        console.log(`       uses 'continue' (skip) rather than setting isActive=false.`);
        console.log(`       This is why the frontend shows Status: Active but Claimable: 0.00`);
      }

      const overBy = effectiveEarnings - cap;
      console.log(`\n       Overshoot: ${ethers.formatUnits(overBy, 18)} USDT beyond the cap`);
      console.log(`       → This user can NEVER claim yield from this stake.`);
      console.log(`       → They need to create a NEW stake (the old one is dead weight).`);
    } else {
      const remaining = cap - effectiveEarnings;
      console.log(`    ✅ Cap not reached yet`);
      console.log(`       Remaining cap space: ${ethers.formatUnits(remaining, 18)} USDT`);

      // Calculate yield
      const tier1Rate = await engine.tier1Rates(s.stakeDayIndex);
      const tier2Rate = await engine.tier2Rates(s.stakeDayIndex);
      const dailyRate = s.tier === 1 ? tier1Rate : tier2Rate;
      const dailyYield = (s.activeStake * BigInt(dailyRate)) / 10000n;
      console.log(`       Today's rate: ${Number(dailyRate) / 100}% (${s.tier === 1 ? "Tier 1" : "Tier 2"})`);
      console.log(`       Daily yield:  ${ethers.formatUnits(dailyYield, 18)} USDT/day`);

      if (completeDays >= 365) {
        console.log(`       ❌ STAKE EXCEEDED 365 DAYS — no more yield accrues!`);
      }
    }

    // ---- Yield breakdown ----
    console.log(`\n    --- YIELD BREAKDOWN ---`);
    console.log(`    Accrued (calculateAccruedYield): ${ethers.formatUnits(accruedYield, 18)} USDT`);
    console.log(`    Already credited (totalEarnings): ${ethers.formatUnits(s.totalEarnings, 18)} USDT`);
    const uncredited = accruedYield > s.totalEarnings ? accruedYield - s.totalEarnings : 0n;
    console.log(`    Uncredited (accrued - credited): ${ethers.formatUnits(uncredited, 18)} USDT`);
    console.log(`    Claimable (getClaimableYield):    ${ethers.formatUnits(claimableYield, 18)} USDT`);

    if (uncredited > 0n && claimableYield === 0n) {
      console.log(`\n    ❌ YIELD IS ACCRUING BUT CANNOT BE CLAIMED!`);
      console.log(`       ${ethers.formatUnits(uncredited, 18)} USDT has accrued but cap prevents claiming.`);

      // Check if totalEarnings is inflated by recordExternalEarning
      if (s.totalEarnings > 0n && accruedYield <= s.totalEarnings) {
        console.log(`\n    🔍 RECORD-EXTERNAL-EARNING CHECK:`);
        console.log(`       totalEarnings (${ethers.formatUnits(s.totalEarnings, 18)}) > accrued (${ethers.formatUnits(accruedYield, 18)})`);
        console.log(`       This means totalEarnings was inflated by recordExternalEarning()`);
        console.log(`       (level commissions added to totalEarnings, blocking yield claims)`);
        console.log(`       This is the dual-purpose totalEarnings design flaw.`);
        console.log(`       Fix: Create a fresh stake via adminSeedStake with totalEarnings=0`);
      }
    }
  }

  // ---- 4. DEX & Vault ----
  console.log("\n--- 4. DEX & VAULT ---");
  const dex = new ethers.Contract(DEX_ADDR, DEX_ABI, signer);
  const osloPrice = await dex.getPrice();
  console.log(`  OSLO Price:  $${ethers.formatUnits(osloPrice, 18)}`);

  const vault = new ethers.Contract(REWARD_VAULT_ADDR, VAULT_ABI, signer);
  const vaultOslo = await vault.osloBalance();
  console.log(`  Vault OSLO:   ${ethers.formatUnits(vaultOslo, 18)}`);

  if (osloPrice === 0n) {
    console.log("  ❌ DEX PRICE IS ZERO — claimYield() would revert!");
  }

  // ---- 5. LevelIncomeSystem role ----
  const levelSystem = new ethers.Contract(LEVEL_SYSTEM_ADDR, LEVEL_ABI, signer);
  const engineRole = await levelSystem.ENGINE_ROLE();
  const hasRole = await levelSystem.hasRole(engineRole, ENGINE_ADDR);
  console.log("\n--- 5. ROLES ---");
  console.log(`  ENGINE_ROLE on LevelIncomeSystem: ${hasRole ? "✅" : "❌ MISSING"}`);
  if (!hasRole) {
    console.log("  ❌ claimYield() would revert at levelSystem.distributeCommissions()!");
  }

  // ---- 6. FINAL DIAGNOSIS ----
  console.log("\n" + "=".repeat(70));
  console.log("FINAL DIAGNOSIS");
  console.log("=".repeat(70));

  if (stakes.length === 0) {
    console.log("❌ No stakes found. User needs to stake first.");
  } else if (isPaused) {
    console.log("❌ Contract is paused. Unpause to enable claiming.");
  } else if (claimableYield > 0n) {
    console.log("✅ Claimable yield exists — the button should be enabled.");
    console.log(`   Claimable: ${ethers.formatUnits(claimableYield, 18)} USDT`);
  } else {
    // Check each possible reason
    let found = false;
    for (let i = 0; i < stakes.length; i++) {
      const s = stakes[i];
      if (!s.isActive) {
        console.log(`❌ Stake #${i + 1} is INACTIVE (isActive=false).`);
        console.log("   The stake was deactivated when the 3X cap was reached during a claim.");
        console.log("   Solution: Create a new stake to generate yield again.");
        found = true;
        continue;
      }
      const cap = s.activeStake * 3n;
      const effectiveEarnings = s.totalEarnings + seededEarnings;
      if (effectiveEarnings >= cap) {
        console.log(`❌ Stake #${i + 1}: 3X CAP EXCEEDED!`);
        console.log(`   Active Stake:       ${ethers.formatUnits(s.activeStake, 18)} USDT`);
        console.log(`   3X Cap:             ${ethers.formatUnits(cap, 18)} USDT`);
        console.log(`   Effective Earnings: ${ethers.formatUnits(effectiveEarnings, 18)} USDT`);
        console.log(`   Cap Used:           ${(Number(effectiveEarnings) / Number(cap) * 100).toFixed(2)}%`);
        console.log("");
        if (seededEarnings > 0n && s.totalEarnings + seededEarnings >= cap) {
          console.log("   ROOT CAUSE: Seeded earnings from migration exceed the 3X cap.");
          console.log("   SOLUTION: Call adminSetSeededEarnings to reset to 0,");
          console.log("             or create a new stake via adminSeedStake.");
        } else {
          console.log("   ROOT CAUSE: totalEarnings exceeded the cap via claiming.");
          console.log("   SOLUTION: Create a new stake via adminSeedStake.");
        }
        found = true;
      } else if (s.totalEarnings > 0n && accruedYield <= s.totalEarnings) {
        // Cap not reached, but totalEarnings blocks claiming (recordExternalEarning)
        console.log(`❌ Stake #${i + 1}: totalEarnings INFLATED BY LEVEL COMMISSIONS`);
        console.log(`   Active Stake:       ${ethers.formatUnits(s.activeStake, 18)} USDT`);
        console.log(`   totalEarnings:      ${ethers.formatUnits(s.totalEarnings, 18)} USDT (includes level commissions)`);
        console.log(`   Accrued Yield:      ${ethers.formatUnits(accruedYield, 18)} USDT`);
        console.log(`   Since accrued <= totalEarnings, claimable = 0`);
        console.log("");
        console.log("   ROOT CAUSE: recordExternalEarning() added level commissions to");
        console.log("   totalEarnings, which is also used for double-claim prevention.");
        console.log("   This blocks staking yield claims even though yield is accruing.");
        console.log("");
        console.log("   SOLUTION: Create a fresh stake via adminSeedStake(user, amount, tier, 0)");
        console.log("   This creates a new stake with totalEarnings=0, unblocking claims.");
        found = true;
      }
    }
    if (!found) {
      console.log("⚠ Unclear issue — check individual stake details above.");
    }
  }

  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
