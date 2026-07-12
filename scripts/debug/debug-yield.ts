import { ethers } from "hardhat";

/**
 * Debug script: Check why yield is not generating for a specific wallet.
 * Reads all on-chain state related to yield calculation.
 *
 * Usage: npx hardhat run scripts/debug/debug-yield.ts --network bscMainnet
 */

const TARGET_WALLET = "0xD2A05EA19E4A7822dE3Fbb6701b8303BCf975f98";
const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const REWARD_VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const OSLO_TOKEN_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const LEVEL_SYSTEM_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getUserStake(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive))",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function getRemainingStakeCapacity(address) view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function paused() view returns (bool)",
  "function tier1Rates(uint256) view returns (uint16)",
  "function tier2Rates(uint256) view returns (uint16)",
];

const DEX_ABI = [
  "function getPrice() view returns (uint256)",
  "function getDEXBalance() view returns (uint256 usdtReserve, uint256 osloReserve)",
];

const VAULT_ABI = [
  "function osloBalance() view returns (uint256)",
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

const LEVEL_ABI = [
  "function ENGINE_ROLE() view returns (bytes32)",
  "function hasRole(bytes32, address) view returns (bool)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("YIELD DEBUG REPORT");
  console.log("=".repeat(70));
  console.log(`Wallet:     ${TARGET_WALLET}`);
  console.log(`Engine:     ${ENGINE_ADDR}`);
  console.log(`Network:    BSC Mainnet (chainId 56)`);
  console.log(`Block time: ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  // ---- 1. Contract pause status ----
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, signer);
  const isPaused = await engine.paused();
  console.log("\n--- 1. CONTRACT STATUS ---");
  console.log(`  Paused: ${isPaused}`);
  if (isPaused) {
    console.log("  ⚠ WARNING: Contract is PAUSED! No yield can be claimed.");
  }

  // ---- 2. Protocol-wide stats ----
  const totalUsers = await engine.totalUsers();
  const totalActiveStakes = await engine.totalActiveStakes();
  const totalTurnover = await engine.totalProtocolTurnover();
  console.log("\n--- 2. PROTOCOL STATS ---");
  console.log(`  Total Users:          ${totalUsers}`);
  console.log(`  Total Active Stakes:  ${ethers.formatUnits(totalActiveStakes, 18)} USDT`);
  console.log(`  Total Turnover:       ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // ---- 3. User-level data ----
  const hasStaked = await engine.hasStaked(TARGET_WALLET);
  const totalClaimed = await engine.totalClaimed(TARGET_WALLET);
  const seededEarnings = await engine.seededEarnings(TARGET_WALLET);
  const accruedYield = await engine.calculateAccruedYield(TARGET_WALLET);
  const claimableYield = await engine.getClaimableYield(TARGET_WALLET);
  const totalActiveStake = await engine.getTotalActiveStake(TARGET_WALLET);
  const remainingCapacity = await engine.getRemainingStakeCapacity(TARGET_WALLET);

  console.log("\n--- 3. USER SUMMARY ---");
  console.log(`  Has Staked:           ${hasStaked}`);
  console.log(`  Total Active Stake:   ${ethers.formatUnits(totalActiveStake, 18)} USDT`);
  console.log(`  Remaining Capacity:   ${ethers.formatUnits(remainingCapacity, 18)} USDT`);
  console.log(`  Seeded Earnings:     ${ethers.formatUnits(seededEarnings, 18)} USDT`);
  console.log(`  Total Claimed:        ${ethers.formatUnits(totalClaimed, 18)} USDT`);
  console.log(`  Accrued Yield:        ${ethers.formatUnits(accruedYield, 18)} USDT`);
  console.log(`  Claimable Yield:      ${ethers.formatUnits(claimableYield, 18)} USDT`);

  // ---- 4. Individual stake details ----
  const stakes = await engine.getUserStakes(TARGET_WALLET);
  console.log("\n--- 4. INDIVIDUAL STAKES ---");
  console.log(`  Total stake entries: ${stakes.length}`);

  if (stakes.length === 0) {
    console.log("  ⚠ NO STAKES FOUND for this wallet!");
    console.log("  This wallet has never staked. Yield cannot generate without an active stake.");
  }

  const now = Math.floor(Date.now() / 1000);
  let totalCap = 0n;
  let totalEffectiveEarnings = 0n;

  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    console.log(`\n  Stake #${i + 1}:`);
    console.log(`    Active Stake:     ${ethers.formatUnits(s.activeStake, 18)} USDT`);
    console.log(`    Total Earnings:   ${ethers.formatUnits(s.totalEarnings, 18)} USDT`);
    console.log(`    Stake Start Time:  ${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString()})`);
    console.log(`    Day Index:        ${s.stakeDayIndex}`);
    console.log(`    Tier:             ${s.tier}`);
    console.log(`    Referrer:         ${s.referrer}`);
    console.log(`    Is Active:        ${s.isActive}`);

    // Calculate time elapsed
    const timeElapsed = now - Number(s.stakeStartTime);
    const completeDays = Math.floor(timeElapsed / 86400);
    const remainingSeconds = timeElapsed % 86400;
    console.log(`    Time Elapsed:     ${completeDays} days, ${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m`);

    // Calculate 3X cap
    const cap = s.activeStake * 3n;
    const effectiveEarnings = s.totalEarnings + seededEarnings;
    totalCap += cap;
    totalEffectiveEarnings += effectiveEarnings;
    const capUsedPct = (Number(effectiveEarnings) / Number(cap)) * 100;

    console.log(`    3X Cap:           ${ethers.formatUnits(cap, 18)} USDT`);
    console.log(`    Effective Earn:   ${ethers.formatUnits(effectiveEarnings, 18)} USDT (totalEarnings + seededEarnings)`);
    console.log(`    Cap Used:         ${capUsedPct.toFixed(2)}%`);

    if (!s.isActive) {
      console.log(`    ⚠ STAKE IS INACTIVE!`);
      if (capUsedPct >= 100) {
        console.log(`    ⚠ 3X CAP REACHED — yield generation stopped for this stake.`);
      } else {
        console.log(`    Stake was deactivated but cap not reached. Possible reasons:`);
        console.log(`      - External earnings (level commissions) pushed earnings to cap`);
        console.log(`      - Admin deactivated the stake`);
      }
    }

    if (completeDays >= 365) {
      console.log(`    ⚠ STAKE HAS EXCEEDED 365 DAYS — no more yield accrues for remaining seconds!`);
    }

    // Show daily rate for today's day index
    const todayDayIndex = Number(s.stakeDayIndex);
    const tier1Rate = await engine.tier1Rates(todayDayIndex);
    const tier2Rate = await engine.tier2Rates(todayDayIndex);
    const dailyRate = s.tier === 1 ? tier1Rate : tier2Rate;
    const dailyYield = (s.activeStake * BigInt(dailyRate)) / 10000n;
    console.log(`    Today's Rate:     ${Number(dailyRate) / 100}% (tier ${s.tier})`);
    console.log(`    Daily Yield:      ${ethers.formatUnits(dailyYield, 18)} USDT/day`);
  }

  // ---- 5. Overall cap status ----
  if (stakes.length > 0) {
    console.log("\n--- 5. CAP STATUS (ALL STAKES) ---");
    console.log(`  Total 3X Cap:           ${ethers.formatUnits(totalCap, 18)} USDT`);
    console.log(`  Total Effective Earn:   ${ethers.formatUnits(totalEffectiveEarnings, 18)} USDT`);
    const overallCapPct = (Number(totalEffectiveEarnings) / Number(totalCap)) * 100;
    console.log(`  Overall Cap Used:       ${overallCapPct.toFixed(2)}%`);
    if (overallCapPct >= 100) {
      console.log("  ⚠ ALL STAKES HAVE REACHED THE 3X CAP!");
      console.log("  No more yield can be generated until new stakes are created.");
    }
  }

  // ---- 6. DEX price and vault balance ----
  const dex = new ethers.Contract(DEX_ADDR, DEX_ABI, signer);
  const osloPrice = await dex.getPrice();

  console.log("\n--- 6. DEX & VAULT STATUS ---");
  console.log(`  OSLO Price:        $${ethers.formatUnits(osloPrice, 18)} USDT`);

  let dexUsdt = 0n;
  let dexOslo = 0n;
  try {
    [dexUsdt, dexOslo] = await dex.getDEXBalance();
    console.log(`  DEX USDT Reserve:  ${ethers.formatUnits(dexUsdt, 18)} USDT`);
    console.log(`  DEX OSLO Reserve:  ${ethers.formatUnits(dexOslo, 18)} OSLO`);
  } catch {
    console.log(`  DEX USDT Reserve:  (getDEXBalance() reverted — using raw balanceOf)`);
    const tokenC = new ethers.Contract(ethers.ZeroAddress, ["function balanceOf(address) view returns (uint256)"], signer);
    // Read USDT and OSLO balances directly
    const usdtC = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", TOKEN_ABI, signer);
    const osloC = new ethers.Contract(OSLO_TOKEN_ADDR, TOKEN_ABI, signer);
    dexUsdt = await usdtC.balanceOf(DEX_ADDR);
    dexOslo = await osloC.balanceOf(DEX_ADDR);
    console.log(`  DEX USDT (raw):    ${ethers.formatUnits(dexUsdt, 18)} USDT`);
    console.log(`  DEX OSLO (raw):    ${ethers.formatUnits(dexOslo, 18)} OSLO`);
  }

  if (osloPrice === 0n) {
    console.log("  ⚠ DEX PRICE IS ZERO! Yield cannot be claimed (claimYield requires price > 0).");
  }

  // Reward Vault OSLO balance
  const vault = new ethers.Contract(REWARD_VAULT_ADDR, VAULT_ABI, signer);
  const vaultOslo = await vault.osloBalance();
  console.log(`  Vault OSLO:        ${ethers.formatUnits(vaultOslo, 18)} OSLO`);

  if (claimableYield > 0n) {
    const osloAmount = (claimableYield * ethers.parseUnits("1", 18)) / osloPrice;
    console.log(`  Expected OSLO:     ${ethers.formatUnits(osloAmount, 18)} OSLO (if claimed now)`);
    if (vaultOslo < osloAmount) {
      console.log("  ⚠ VAULT HAS INSUFFICIENT OSLO! Claim would revert.");
    }
  }

  // ---- 7. LevelIncomeSystem role check ----
  const levelSystem = new ethers.Contract(LEVEL_SYSTEM_ADDR, LEVEL_ABI, signer);
  const engineRoleOnLevel = await levelSystem.ENGINE_ROLE();
  const engineHasRole = await levelSystem.hasRole(engineRoleOnLevel, ENGINE_ADDR);
  console.log("\n--- 7. LEVEL SYSTEM ROLES ---");
  console.log(`  ENGINE_ROLE on LevelIncomeSystem: ${engineHasRole ? "✅ Granted" : "❌ MISSING"}`);
  if (!engineHasRole) {
    console.log("  ⚠ InvestmentEngine does NOT have ENGINE_ROLE on LevelIncomeSystem!");
    console.log("  This would cause claimYield() to revert at levelSystem.distributeCommissions().");
  }

  // ---- 8. Diagnosis ----
  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSIS");
  console.log("=".repeat(70));

  if (stakes.length === 0) {
    console.log("❌ NO STAKES: This wallet has no stakes. Yield cannot generate.");
  } else if (isPaused) {
    console.log("❌ CONTRACT PAUSED: The InvestmentEngine is paused. Unpause to resume.");
  } else if (totalActiveStake === 0n) {
    console.log("❌ NO ACTIVE STAKES: All stakes are inactive (3X cap reached or deactivated).");
    console.log("   The user needs to create a new stake to generate yield again.");
  } else if (claimableYield > 0n) {
    console.log("✅ YIELD IS GENERATING: Claimable yield exists. The user can claim now.");
    console.log(`   Claimable: ${ethers.formatUnits(claimableYield, 18)} USDT worth of OSLO`);
  } else if (accruedYield === 0n) {
    console.log("❌ ZERO ACCRUED YIELD: Yield calculation returned 0 despite active stakes.");
    console.log("   Possible causes:");
    console.log("   - Stake was created very recently (less than 1 second ago — unlikely)");
    console.log("   - completeDays >= 365 (yield stopped after 365 days)");
    console.log("   - All active stakes have 0 activeStake (shouldn't happen)");
  } else if (accruedYield > 0n && claimableYield === 0n) {
    console.log("❌ ACCRUED YIELD EXISTS BUT CLAIMABLE IS ZERO");
    console.log("   This means: accrued > 0 BUT accrued <= totalEarnings (already claimed)");
    console.log("   OR: effectiveEarnings >= cap (3X cap reached)");
    console.log(`   Accrued:    ${ethers.formatUnits(accruedYield, 18)} USDT`);
    console.log(`   Effective:  ${ethers.formatUnits(totalEffectiveEarnings, 18)} USDT`);
    console.log(`   Total Cap:  ${ethers.formatUnits(totalCap, 18)} USDT`);
  } else {
    console.log("⚠ UNCLEAR: Yield appears to be generating but something else may be wrong.");
    console.log("   Check the individual stake details above for more info.");
  }

  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
