import { ethers } from "hardhat";

/**
 * Debug script: Check yield calculation for a specific user
 * Usage: npx hardhat run scripts/debug-staking.ts --network bscTestnet
 */

const INVESTMENT_ENGINE = "0x09c56236B863FA39c2F68BD8a97f5217f89571EF";
const OSLO_DEX = "0x6e068cfd2D2878250c576aa70e1aCa64e58bEe1b";
const OSLO_TOKEN = "0x69E35319980F133612f39DD56616a46b5d7b8010";
const USDT = "0x887524926554F1e1A8Eeb3F99a0d9F6Bc9cd53dd";

// User's private key (user reporting incorrect yield on large investments)
const USER_PK = "38ef9ba2a6d91dbf5c5f02f4291fed3f1763e373d946536e684babc06f9f1d30";

// Contract constants (mirroring OSLOConstants.sol V3)
const BASIS_POINTS = 10_000n;
const PKG2_MIN = ethers.parseEther("2500"); // $2500 threshold for Package 2
const LIFETIME_RATE = 45n; // 0.45% daily
const LIFETIME_RATE_START = 90n * 24n * 60n * 60n; // 90 days
const RETURN_CAP_MULTIPLIER = 3n;
const ONE_DAY = 86400n;

// 7-day rotational schedule (bp) — Mon=0, Sun=6
// Package 1 ($10 – $2,499)
const PKG1_RATES = [100n, 75n, 95n, 65n, 100n, 85n, 55n]; // Mon-Sun in bp
const PKG1_WEEKLY_TOTAL = 575n; // sum of above
// Package 2 ($2,500+)
const PKG2_RATES = [115n, 100n, 115n, 110n, 105n, 100n, 125n]; // Mon-Sun in bp
const PKG2_WEEKLY_TOTAL = 770n; // sum of above

// Dynamic Yield Schedule (frontend display %) - for comparison
const YIELD_SCHEDULE_TIER1 = [1.00, 0.75, 0.95, 0.65, 1.00, 0.85, 0.55]; // Mon-Sun
const YIELD_SCHEDULE_TIER2 = [1.15, 1.00, 1.15, 1.10, 1.05, 1.00, 1.25]; // Mon-Sun

function getPackage(amount: bigint): number {
  return amount >= PKG2_MIN ? 2 : 1;
}

function getDayOfWeek(timestamp: bigint): number {
  // Matches contract: (timestamp / 86400 + 3) % 7 → 0=Mon, 6=Sun
  return Number((timestamp / 86400n + 3n) % 7n);
}

function getDailyRateForDay(pkg: number, dayOfWeek: number): bigint {
  return pkg === 2 ? PKG2_RATES[dayOfWeek] : PKG1_RATES[dayOfWeek];
}

function getDailyRate(amount: bigint, launchTimestamp: bigint, currentTimestamp: bigint): bigint {
  const elapsed = currentTimestamp - launchTimestamp;
  if (elapsed >= LIFETIME_RATE_START) {
    return LIFETIME_RATE;
  }
  const dayOfWeek = getDayOfWeek(currentTimestamp);
  const pkg = getPackage(amount);
  return getDailyRateForDay(pkg, dayOfWeek);
}

/**
 * Replicates contract _calculatePendingRewards logic exactly:
 * - Full weeks use weeklyBp sum
 * - Partial days iterate per-day with second-level precision
 */
function calculatePendingRewards(
  amount: bigint,
  lastClaimTime: bigint,
  totalClaimed: bigint,
  maxReturn: bigint,
  launchTimestamp: bigint,
  currentTimestamp: bigint
): { pending: bigint; method: string; timeElapsed: bigint; breakdown: string[] } {
  const timeElapsed = currentTimestamp - lastClaimTime;
  if (timeElapsed === 0n) return { pending: 0n, method: "none", timeElapsed: 0n, breakdown: [] };

  let pendingUSDT = 0n;
  let method = "";
  const breakdown: string[] = [];

  // After 3 months: flat lifetime rate (simple calculation)
  if (currentTimestamp - launchTimestamp >= LIFETIME_RATE_START) {
    method = "lifetime_flat";
    pendingUSDT = (amount * LIFETIME_RATE * timeElapsed) / (ONE_DAY * BASIS_POINTS);
    breakdown.push(`Lifetime: (${ethers.formatEther(amount)} × 45bp × ${timeElapsed}s) / (86400 × 10000) = ${ethers.formatEther(pendingUSDT)}`);
  } else {
    method = "7day_rotational";
    const isPkg2 = amount >= PKG2_MIN;
    const weeklyBp = isPkg2 ? PKG2_WEEKLY_TOTAL : PKG1_WEEKLY_TOTAL;

    // Full weeks optimization
    const fullWeeks = timeElapsed / (7n * ONE_DAY);
    const fullWeekYield = (amount * weeklyBp * fullWeeks) / BASIS_POINTS;
    pendingUSDT = fullWeekYield;
    if (fullWeeks > 0n) {
      breakdown.push(`Full weeks (${fullWeeks}): (${ethers.formatEther(amount)} × ${weeklyBp}bp × ${fullWeeks}) / 10000 = ${ethers.formatEther(fullWeekYield)}`);
    }

    // Partial remaining days
    let remainingStart = lastClaimTime + (fullWeeks * 7n * ONE_DAY);
    let partialBpSeconds = 0n;
    let dayCount = 0;

    while (remainingStart < currentTimestamp) {
      const dayOfWeek = getDayOfWeek(remainingStart);
      const rate = isPkg2 ? PKG2_RATES[dayOfWeek] : PKG1_RATES[dayOfWeek];
      const dayEnd = ((remainingStart / ONE_DAY) + 1n) * ONE_DAY;
      const periodEnd = currentTimestamp < dayEnd ? currentTimestamp : dayEnd;
      const periodSeconds = periodEnd - remainingStart;

      partialBpSeconds += rate * periodSeconds;
      breakdown.push(`  Day ${dayCount} (dow=${dayOfWeek}): rate=${rate}bp × ${periodSeconds}s = ${rate * periodSeconds} bp·s`);
      remainingStart = dayEnd;
      dayCount++;
    }

    const partialYield = (amount * partialBpSeconds) / (ONE_DAY * BASIS_POINTS);
    pendingUSDT += partialYield;
    breakdown.push(`Partial total: (${ethers.formatEther(amount)} × ${partialBpSeconds} bp·s) / (86400 × 10000) = ${ethers.formatEther(partialYield)}`);
  }

  // 3X per-deposit cap check
  const remaining = maxReturn > totalClaimed ? maxReturn - totalClaimed : 0n;
  if (pendingUSDT > remaining) {
    breakdown.push(`⚠ Capped: ${ethers.formatEther(pendingUSDT)} > remaining ${ethers.formatEther(remaining)}`);
    pendingUSDT = remaining;
  }

  return { pending: pendingUSDT, method, timeElapsed, breakdown };
}

async function main() {
  const provider = ethers.provider;
  const userWallet = new ethers.Wallet(USER_PK, provider);
  const userAddress = userWallet.address;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   OSLO Staking Yield Debug Script");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`User Address: ${userAddress}`);
  console.log(`Network: BSC Testnet (chainId 97)`);
  console.log("");

  // Get current block timestamp
  const block = await provider.getBlock("latest");
  const currentTimestamp = BigInt(block!.timestamp);
  const currentDate = new Date(Number(currentTimestamp) * 1000);
  const contractDayOfWeek = getDayOfWeek(currentTimestamp);
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  console.log(`Current Block Timestamp: ${currentTimestamp} (${currentDate.toUTCString()})`);
  console.log(`Contract Day-of-Week:    ${contractDayOfWeek} (${dayNames[contractDayOfWeek]})`);
  console.log(`JS Date Day:             ${currentDate.getUTCDay()} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][currentDate.getUTCDay()]})`);
  console.log("");

  // InvestmentEngine ABI (minimal)
  const ieAbi = [
    "function userDeposits(address, uint256) view returns (uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositTime, uint256 lastClaimTime, uint256 totalClaimed, uint256 maxReturn, bool active)",
    "function users(address) view returns (uint256 totalActiveDeposit, uint256 depositCount, uint256 totalCombinedEarnings)",
    "function getDepositCount(address) view returns (uint256)",
    "function getPendingRewards(address, uint256) view returns (uint256)",
    "function launchTimestamp() view returns (uint256)",
    "function minClaimThreshold() view returns (uint256)",
    "function totalDeposited() view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
  ];

  const dexAbi = [
    "function getReserves() view returns (uint256 usdtRes, uint256 osloRes)",
    "function getPrice() view returns (uint256)",
    "function getUSDTForOSLOOutput(uint256 usdtAmount) view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
  ];

  const ie = new ethers.Contract(INVESTMENT_ENGINE, ieAbi, provider);
  const dex = new ethers.Contract(OSLO_DEX, dexAbi, provider);
  const osloToken = new ethers.Contract(OSLO_TOKEN, erc20Abi, provider);
  const usdt = new ethers.Contract(USDT, erc20Abi, provider);

  // Get launch timestamp
  const launchTs = await ie.launchTimestamp();
  const launchDate = new Date(Number(launchTs) * 1000);
  const elapsedSinceLaunch = currentTimestamp - launchTs;
  const lifetimeActive = elapsedSinceLaunch >= LIFETIME_RATE_START;

  console.log("─── Protocol State ──────────────────────────────────────────");
  console.log(`Launch Timestamp: ${launchTs} (${launchDate.toUTCString()})`);
  console.log(`Elapsed Since Launch: ${Number(elapsedSinceLaunch) / 86400} days`);
  console.log(`Lifetime Rate Active (≥90 days): ${lifetimeActive}`);
  console.log(`Min Claim Threshold: ${ethers.formatEther(await ie.minClaimThreshold())} USDT`);
  console.log("");

  // DEX state
  const [dexUsdt, dexOslo] = await dex.getReserves();
  const dexPrice = await dex.getPrice();
  console.log("─── DEX State ───────────────────────────────────────────────");
  console.log(`USDT Reserve: ${ethers.formatEther(dexUsdt)} USDT`);
  console.log(`OSLO Reserve: ${ethers.formatEther(dexOslo)} OSLO`);
  console.log(`OSLO Price: ${ethers.formatEther(dexPrice)} USDT/OSLO`);
  console.log("");

  // User balances
  const userUsdtBal = await usdt.balanceOf(userAddress);
  const userOsloBal = await osloToken.balanceOf(userAddress);
  console.log("─── User Balances ───────────────────────────────────────────");
  console.log(`USDT: ${ethers.formatEther(userUsdtBal)}`);
  console.log(`OSLO: ${ethers.formatEther(userOsloBal)}`);
  console.log("");

  // User info
  const userInfo = await ie.users(userAddress);
  const depositCount = await ie.getDepositCount(userAddress);

  console.log("─── User Investment Info ─────────────────────────────────────");
  console.log(`Total Active Deposit: ${ethers.formatEther(userInfo.totalActiveDeposit)} USDT`);
  console.log(`Deposit Count: ${depositCount}`);
  console.log(`Total Combined Earnings: ${ethers.formatEther(userInfo.totalCombinedEarnings)} USDT`);
  console.log("");

  if (Number(depositCount) === 0) {
    console.log("⚠ No deposits found for this user.");
    return;
  }

  // Iterate through each deposit
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   DEPOSIT DETAILS & YIELD ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════");

  let totalPendingContract = 0n;
  let totalPendingCalculated = 0n;

  for (let i = 0; i < Number(depositCount); i++) {
    const dep = await ie.userDeposits(userAddress, i);
    const [amount, tier, dailyRate, depositTime, lastClaimTime, totalClaimed, maxReturn, active] = dep;

    console.log("");
    console.log(`┌─── Deposit #${i} ${"─".repeat(45)}`);
    console.log(`│ Amount:         ${ethers.formatEther(amount)} USDT`);
    console.log(`│ Tier:           ${tier}`);
    console.log(`│ Cached Rate:    ${Number(dailyRate) / 100}% daily (${dailyRate} bp)`);
    console.log(`│ Active:         ${active}`);
    console.log(`│`);

    const depDate = new Date(Number(depositTime) * 1000);
    const claimDate = new Date(Number(lastClaimTime) * 1000);
    console.log(`│ Deposit Time:   ${depositTime} (${depDate.toUTCString()})`);
    console.log(`│ Last Claim:     ${lastClaimTime} (${claimDate.toUTCString()})`);
    console.log(`│ Total Claimed:  ${ethers.formatEther(totalClaimed)} USDT`);
    console.log(`│ Max Return (3X):${ethers.formatEther(maxReturn)} USDT`);
    console.log(`│`);

    if (!active) {
      console.log(`│ ⚠ INACTIVE — deposit capped or exited`);
      console.log(`└${"─".repeat(60)}`);
      continue;
    }

    // Time elapsed since last claim
    const timeElapsed = currentTimestamp - BigInt(lastClaimTime);
    const hoursElapsed = Number(timeElapsed) / 3600;
    const daysElapsed = Number(timeElapsed) / 86400;

    console.log(`│ ── Yield Calculation ──`);
    console.log(`│ Time Since Claim: ${daysElapsed.toFixed(4)} days (${hoursElapsed.toFixed(2)} hours = ${timeElapsed}s)`);

    // Calculate effective rate (current day)
    const pkg = getPackage(amount);
    const todayRate = getDailyRate(amount, launchTs, currentTimestamp);
    const isLifetime = (currentTimestamp - launchTs >= LIFETIME_RATE_START);
    console.log(`│ Package:         ${pkg} (${pkg === 2 ? "$2500+" : "$10-$2499"})`);
    console.log(`│ Today’s Rate:    ${Number(todayRate) / 100}% (${todayRate} bp) [${isLifetime ? "LIFETIME" : "7-day schedule"}]`);
    console.log(`│ Cached Rate:     ${Number(dailyRate) / 100}% daily (${dailyRate} bp)`);
    if (!isLifetime && todayRate !== BigInt(dailyRate)) {
      console.log(`│ ℹ Note: cached rate was set at deposit time — yield uses per-day lookup, not cached`);
    }

    // Manual calculation (exact contract replication)
    const manualCalc = calculatePendingRewards(
      amount,
      BigInt(lastClaimTime),
      totalClaimed,
      maxReturn,
      launchTs,
      currentTimestamp
    );

    console.log(`│`);
    console.log(`│ ── Manual Calculation (replicating contract) ──`);
    console.log(`│ Method: ${manualCalc.method}`);
    for (const line of manualCalc.breakdown) {
      console.log(`│   ${line}`);
    }
    console.log(`│ Calculated Yield: ${ethers.formatEther(manualCalc.pending)} USDT`);

    // 3X cap check
    const remaining3X = maxReturn > totalClaimed ? maxReturn - totalClaimed : 0n;
    const capPct = Number(totalClaimed) / Number(maxReturn) * 100;
    console.log(`│ 3X Remaining:    ${ethers.formatEther(remaining3X)} USDT (${capPct.toFixed(2)}% used)`);

    // Contract's reported pending
    const contractPending = await ie.getPendingRewards(userAddress, i);
    console.log(`│`);
    console.log(`│ ── Contract vs Calculated ──`);
    console.log(`│ Contract Pending:   ${ethers.formatEther(contractPending)} USDT`);
    console.log(`│ Calculated Pending: ${ethers.formatEther(manualCalc.pending)} USDT`);

    const diff = contractPending > manualCalc.pending
      ? contractPending - manualCalc.pending
      : manualCalc.pending - contractPending;
    const diffPct = Number(manualCalc.pending) > 0 ? (Number(diff) / Number(manualCalc.pending) * 100).toFixed(4) : "0";
    if (diff > 0n) {
      console.log(`│ ⚠ DIFFERENCE:      ${ethers.formatEther(diff)} USDT (${diffPct}%)`);
      if (diff > ethers.parseEther("0.01")) {
        console.log(`│ ❌ SIGNIFICANT MISMATCH! Investigate further.`);
      } else {
        console.log(`│ ✓ Negligible (block timing between calls)`);
      }
    } else {
      console.log(`│ ✓ EXACT MATCH`);
    }

    // OSLO equivalent at current DEX rate
    if (contractPending > 0n) {
      try {
        const osloEquiv = await dex.getUSDTForOSLOOutput(contractPending);
        console.log(`│`);
        console.log(`│ ── OSLO Conversion ──`);
        console.log(`│ Claimable OSLO:  ${ethers.formatEther(osloEquiv)} OSLO`);
        console.log(`│ (using getUSDTForOSLOOutput at current DEX rate)`);
      } catch (e: any) {
        console.log(`│ ⚠ DEX quote failed: ${e.message?.slice(0, 60)}`);
      }
    }

    // Daily yield projection (using today's rate)
    const dailyYield = (amount * todayRate) / (BASIS_POINTS);
    const weeklyYield = (amount * (pkg === 2 ? PKG2_WEEKLY_TOTAL : PKG1_WEEKLY_TOTAL)) / BASIS_POINTS;
    console.log(`│`);
    console.log(`│ ── Daily/Weekly Projection ──`);
    console.log(`│ Today’s yield:   ${ethers.formatEther(dailyYield)} USDT`);
    console.log(`│ Per hour:        ${ethers.formatEther(dailyYield / 24n)} USDT`);
    console.log(`│ Per minute:      ${(Number(dailyYield) / 1e18 / 1440).toFixed(8)} USDT`);
    console.log(`│ Full week yield: ${ethers.formatEther(weeklyYield)} USDT`);
    console.log(`│ Days to 3X cap:  ${(Number(remaining3X) / Number(weeklyYield) * 7).toFixed(1)} days (at avg weekly rate)`);
    
    // Frontend vs Contract comparison
    const scheduleIdx = contractDayOfWeek; // 0=Mon, 6=Sun
    const scheduleRate = pkg === 2 ? YIELD_SCHEDULE_TIER2[scheduleIdx] : YIELD_SCHEDULE_TIER1[scheduleIdx];
    const frontendDailyYield = (Number(amount) / 1e18) * (scheduleRate / 100);
    const contractDailyYield = Number(dailyYield) / 1e18;
    
    console.log(`│`);
    console.log(`│ ── Frontend vs Contract (today: ${dayNames[scheduleIdx]}) ──`);
    console.log(`│ Frontend rate:   ${scheduleRate}% → $${frontendDailyYield.toFixed(6)}/day`);
    console.log(`│ Contract rate:   ${Number(todayRate) / 100}% → $${contractDailyYield.toFixed(6)}/day`);
    if (Math.abs(frontendDailyYield - contractDailyYield) > 0.001) {
      console.log(`│ ❌ FRONTEND/CONTRACT YIELD MISMATCH!`);
      console.log(`│   Frontend: $${frontendDailyYield.toFixed(6)} vs Contract: $${contractDailyYield.toFixed(6)}`);
    } else {
      console.log(`│ ✓ Frontend matches contract`);
    }
    console.log(`└${"\u2500".repeat(60)}`);

    totalPendingContract += contractPending;
    totalPendingCalculated += manualCalc.pending;
  }

  // Summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Total Deposits:          ${depositCount}`);
  console.log(`Total Active Deposit:    ${ethers.formatEther(userInfo.totalActiveDeposit)} USDT`);
  console.log(`Total Pending (Contract):${ethers.formatEther(totalPendingContract)} USDT`);
  console.log(`Total Pending (Calc):    ${ethers.formatEther(totalPendingCalculated)} USDT`);
  console.log(`Combined Earnings Used:  ${ethers.formatEther(userInfo.totalCombinedEarnings)} USDT`);
  console.log(`Combined 3X Cap:         ${ethers.formatEther(userInfo.totalActiveDeposit * RETURN_CAP_MULTIPLIER)} USDT`);
  console.log("");

  // IE OSLO reserve check
  const ieOsloBal = await osloToken.balanceOf(INVESTMENT_ENGINE);
  console.log("─── InvestmentEngine Reserve ────────────────────────────────");
  console.log(`OSLO Balance: ${ethers.formatEther(ieOsloBal)} OSLO`);
  console.log(`USDT Balance: ${ethers.formatEther(await usdt.balanceOf(INVESTMENT_ENGINE))} USDT`);
  console.log("");

  // Check if claim would succeed
  if (totalPendingContract > 0n) {
    try {
      const osloNeeded = await dex.getUSDTForOSLOOutput(totalPendingContract);
      const canClaim = ieOsloBal >= osloNeeded;
      console.log("─── Claim Feasibility ───────────────────────────────────────");
      console.log(`OSLO needed for full claim: ${ethers.formatEther(osloNeeded)} OSLO`);
      console.log(`IE has enough OSLO: ${canClaim ? "✓ YES" : "❌ NO"}`);
      if (!canClaim) {
        console.log(`Shortfall: ${ethers.formatEther(osloNeeded - ieOsloBal)} OSLO`);
      }
    } catch (e: any) {
      console.log(`DEX quote for claim check failed: ${e.message?.slice(0, 80)}`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   DEBUG COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
