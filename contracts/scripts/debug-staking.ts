import { ethers } from "hardhat";

/**
 * Debug script: Check yield calculation for a specific user
 * Usage: npx hardhat run scripts/debug-staking.ts --network bscTestnet
 */

const INVESTMENT_ENGINE = "0xAb4043Fc6Fb33BC75B96ABf1A0bE4871cFA57287";
const OSLO_DEX = "0xD99A51026218Af9D29c991B4D28591f6BA7766EA";
const OSLO_TOKEN = "0x30bcAc54a58b429802458c6b8A80046e99B16752";
const USDT = "0x9549e7DdBb347900bcE777223255BbEAC03BAfC6";

// User's private key
const USER_PK = "60884d7626fda89b847bb084550ff8baf868545ce02fd9e386a0f6be8e96521b";

// Contract constants (mirroring OSLOConstants.sol)
const BASIS_POINTS = 10_000n;
const TIER1_MIN = ethers.parseEther("10");
const TIER1_MAX = ethers.parseEther("499");
const TIER2_MIN = ethers.parseEther("500");
const TIER2_MAX = ethers.parseEther("2499");
const TIER3_MIN = ethers.parseEther("2500");
const TIER3_MAX = ethers.parseEther("4999");
const TIER4_MIN = ethers.parseEther("5000");
const TIER4_IMPLICIT_MAX = ethers.parseEther("50000");
const TIER1_RATE_MIN = 50n;
const TIER1_RATE_MAX = 100n;
const TIER2_RATE_MIN = 75n;
const TIER2_RATE_MAX = 115n;
const TIER3_RATE_MIN = 100n;
const TIER3_RATE_MAX = 150n;
const TIER4_RATE_MIN = 100n;
const TIER4_RATE_MAX = 175n;
const LIFETIME_RATE = 45n;
const LIFETIME_RATE_START = 90n * 24n * 60n * 60n; // 90 days
const RETURN_CAP_MULTIPLIER = 3n;
const ONE_DAY = 86400n;

// Dynamic Yield Schedule (frontend display) - for comparison
const YIELD_SCHEDULE_TIER1 = [1.00, 0.75, 0.95, 0.65, 1.00, 0.85, 0.55]; // Mon-Sun
const YIELD_SCHEDULE_TIER2 = [1.15, 1.00, 1.15, 1.10, 1.05, 1.00, 1.25]; // Mon-Sun

function getTier(amount: bigint): number {
  if (amount >= TIER4_MIN) return 4;
  if (amount >= TIER3_MIN) return 3;
  if (amount >= TIER2_MIN) return 2;
  return 1;
}

function interpolate(amount: bigint, minAmt: bigint, maxAmt: bigint, minRate: bigint, maxRate: bigint): bigint {
  if (maxAmt <= minAmt) return minRate;
  const rateRange = maxRate - minRate;
  const amtRange = maxAmt - minAmt;
  return minRate + ((amount - minAmt) * rateRange) / amtRange;
}

function getDailyRate(amount: bigint, launchTimestamp: bigint, currentTimestamp: bigint): bigint {
  const elapsed = currentTimestamp - launchTimestamp;
  if (elapsed >= LIFETIME_RATE_START) {
    return LIFETIME_RATE;
  }
  const tier = getTier(amount);
  if (tier === 1) return interpolate(amount, TIER1_MIN, TIER1_MAX, TIER1_RATE_MIN, TIER1_RATE_MAX);
  if (tier === 2) return interpolate(amount, TIER2_MIN, TIER2_MAX, TIER2_RATE_MIN, TIER2_RATE_MAX);
  if (tier === 3) return interpolate(amount, TIER3_MIN, TIER3_MAX, TIER3_RATE_MIN, TIER3_RATE_MAX);
  // Tier 4
  const capped = amount > TIER4_IMPLICIT_MAX ? TIER4_IMPLICIT_MAX : amount;
  return interpolate(capped, TIER4_MIN, TIER4_IMPLICIT_MAX, TIER4_RATE_MIN, TIER4_RATE_MAX);
}

function calculatePendingRewards(
  amount: bigint,
  lastClaimTime: bigint,
  totalClaimed: bigint,
  maxReturn: bigint,
  launchTimestamp: bigint,
  currentTimestamp: bigint
): { pending: bigint; effectiveRate: bigint; timeElapsed: bigint } {
  const timeElapsed = currentTimestamp - lastClaimTime;
  if (timeElapsed === 0n) return { pending: 0n, effectiveRate: 0n, timeElapsed: 0n };

  let effectiveRate = getDailyRate(amount, launchTimestamp, currentTimestamp);
  // After 3 months, force lifetime rate
  if (currentTimestamp - launchTimestamp >= LIFETIME_RATE_START) {
    effectiveRate = LIFETIME_RATE;
  }

  let pendingUSDT = (amount * effectiveRate * timeElapsed) / (ONE_DAY * BASIS_POINTS);

  // 3X cap
  const remaining = maxReturn > totalClaimed ? maxReturn - totalClaimed : 0n;
  if (pendingUSDT > remaining) {
    pendingUSDT = remaining;
  }

  return { pending: pendingUSDT, effectiveRate, timeElapsed };
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
  console.log(`Current Block Timestamp: ${currentTimestamp} (${currentDate.toUTCString()})`);
  console.log(`Current Day: ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][currentDate.getUTCDay()]}`);
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

    // Calculate effective rate
    const effectiveRate = getDailyRate(amount, launchTs, currentTimestamp);
    const effectiveRateForced = (currentTimestamp - launchTs >= LIFETIME_RATE_START) ? LIFETIME_RATE : effectiveRate;
    console.log(`│ Effective Rate:  ${Number(effectiveRateForced) / 100}% daily (${effectiveRateForced} bp)`);
    console.log(`│ Cached Rate:     ${Number(dailyRate) / 100}% daily (${dailyRate} bp)`);
    if (effectiveRateForced !== BigInt(dailyRate)) {
      console.log(`│ ⚠ Rate mismatch! Contract cached: ${dailyRate} bp vs Current: ${effectiveRateForced} bp`);
    }

    // Manual calculation
    const manualCalc = calculatePendingRewards(
      amount,
      BigInt(lastClaimTime),
      totalClaimed,
      maxReturn,
      launchTs,
      currentTimestamp
    );

    console.log(`│`);
    console.log(`│ ── Manual Calculation ──`);
    console.log(`│ Formula: (amount × rate × time) / (86400 × 10000)`);
    console.log(`│        = (${ethers.formatEther(amount)} × ${effectiveRateForced} × ${timeElapsed}) / (86400 × 10000)`);
    console.log(`│ Raw Yield:       ${ethers.formatEther(manualCalc.pending)} USDT`);

    // 3X cap check
    const remaining3X = maxReturn > totalClaimed ? maxReturn - totalClaimed : 0n;
    const capPct = Number(totalClaimed) / Number(maxReturn) * 100;
    console.log(`│ 3X Remaining:    ${ethers.formatEther(remaining3X)} USDT (${capPct.toFixed(2)}% used)`);
    if (manualCalc.pending > remaining3X) {
      console.log(`│ ⚠ Capped! Raw ${ethers.formatEther(manualCalc.pending)} > Remaining ${ethers.formatEther(remaining3X)}`);
    }

    // Contract's reported pending
    const contractPending = await ie.getPendingRewards(userAddress, i);
    console.log(`│`);
    console.log(`│ ── Comparison ──`);
    console.log(`│ Contract Pending:   ${ethers.formatEther(contractPending)} USDT`);
    console.log(`│ Calculated Pending: ${ethers.formatEther(manualCalc.pending)} USDT`);

    const diff = contractPending > manualCalc.pending
      ? contractPending - manualCalc.pending
      : manualCalc.pending - contractPending;
    if (diff > 0n) {
      console.log(`│ ⚠ DIFFERENCE:      ${ethers.formatEther(diff)} USDT`);
      if (diff > ethers.parseEther("0.01")) {
        console.log(`│ ❌ SIGNIFICANT MISMATCH!`);
      } else {
        console.log(`│ ✓ Negligible (block timing)`);
      }
    } else {
      console.log(`│ ✓ MATCH — no discrepancy`);
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

    // Daily yield projection
    const dailyYield = (amount * effectiveRateForced) / (BASIS_POINTS);
    console.log(`│`);
    console.log(`│ ── Daily Projection ──`);
    console.log(`│ Expected per day:  ${ethers.formatEther(dailyYield)} USDT`);
    console.log(`│ Expected per hour: ${ethers.formatEther(dailyYield / 24n)} USDT`);

    // Frontend Dynamic Yield Schedule comparison
    const scheduleTier = Number(amount) / 1e18 >= 2500 ? 2 : 1;
    const dayOfWeek = currentDate.getUTCDay(); // 0=Sun
    const scheduleIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0, Sun=6
    const scheduleRate = scheduleTier === 1 ? YIELD_SCHEDULE_TIER1[scheduleIdx] : YIELD_SCHEDULE_TIER2[scheduleIdx];
    const scheduleYield = (Number(amount) / 1e18) * (scheduleRate / 100);

    console.log(`│`);
    console.log(`│ ── Frontend Yield Schedule (Display Only) ──`);
    console.log(`│ Schedule Tier: ${scheduleTier} (${scheduleTier === 1 ? "$10-$2499" : "$2500+"})`);
    console.log(`│ Today's Rate:  ${scheduleRate}% (${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][scheduleIdx]})`);
    console.log(`│ Schedule Yield:${scheduleYield.toFixed(4)} USDT/day`);
    console.log(`│ Contract Rate: ${Number(effectiveRateForced) / 100}% → ${Number(dailyYield) / 1e18} USDT/day`);
    if (Math.abs(scheduleRate - Number(effectiveRateForced) / 100) > 0.01) {
      console.log(`│ ⚠ SCHEDULE vs CONTRACT RATE DIFFER!`);
      console.log(`│   Frontend shows ${scheduleRate}% but contract uses ${Number(effectiveRateForced) / 100}%`);
    }
    console.log(`└${"─".repeat(60)}`);

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
