// OSLO Protocol V2 Constants — mirrors OSLOConstants.sol
// USDT-based, 4-tier ranged yields, lifetime 0.45% rate, combined 3X cap

export const BASIS_POINTS = 10_000;

// ─── Token ──────────────────────────────────────────────────────────────
export const TOTAL_SUPPLY = 11_100_000;
export const TOTAL_SUPPLY_WEI = BigInt("11100000000000000000000000");
export const CONTRACT_RESERVE = 11_000_000;
export const DEX_ALLOCATION = 100_000;

// ─── Fees ───────────────────────────────────────────────────────────────
// V3: No withdrawal fee on yield claims — full yield auto-buys OSLO at DEX rate.
export const WITHDRAWAL_FEE_PCT = 0; // 0% — removed in V3 (tax-free yield auto-buy)
export const MIN_WITHDRAWAL_THRESHOLD = 1; // $1 USDT minimum

// ─── Sell Tax / Swap Fee Distribution (V3) ───────────────────────────────
// V3: 10% fee on sells → OSLO burned. USDT fee stays in DEX as LP.
//     90% of sold OSLO goes to DEX for swap. No IE routing.
export const SELL_TAX_PCT = 10; // 10% fee → OSLO burned, USDT to LP
export const SWAP_TO_LP_PCT = 10; // 10% → LP (USDT stays in DEX)
export const SWAP_OSLO_RECEIVED_PCT = 90; // 90% → DEX receives for swap

// ─── Burn Cap ────────────────────────────────────────────────────────────
export const TOTAL_SUPPLY_TOKENS = 11_100_000;
export const MAX_BURN_TOKENS = 9_990_000; // 90% of supply — burn stops here
export const MIN_REMAINING_TOKENS = 1_110_000; // 10% remains after max burn

// ─── Early Exit ──────────────────────────────────────────────────────────
export const EARLY_EXIT_PERIOD_DAYS = 10;
export const EARLY_EXIT_PERIOD_SECONDS = 10 * 86400;
export const EARLY_EXIT_FEE_PCT = 10; // 10% fee on early exit

// ─── Return Cap ─────────────────────────────────────────────────────────
export const RETURN_CAP_MULTIPLIER = 3; // 3X combined cap

// ─── Launch Timestamp ───────────────────────────────────────────────────
// May 10, 2026 00:00:00 UTC
export const LAUNCH_TIMESTAMP = 1_778_371_200;

// ─── Lifetime Rate ──────────────────────────────────────────────────────
export const LIFETIME_RATE_BP = 45; // 0.45% daily
export const LIFETIME_RATE_START = 90 * 86400; // 3 months after launch

// ─── Treasury Distribution ──────────────────────────────────────────────
export const TREASURY_TO_RANK_PCT = 0;  // 0% → (all from Liquidity)
export const TREASURY_TO_DAO_PCT = 0;   // 0% → (all from Liquidity)
export const TREASURY_TO_LP_PCT = 100;   // 100% → liquidity

// ─── Deposit Fee Split (2% total to reward wallets) ───────────────────
export const DEPOSIT_TO_DEX_PCT = 98;         // 98% → DEX liquidity
export const DEPOSIT_TO_REWARD_PCT = 1;       // 1.0% → reward wallet
export const DEPOSIT_TO_COMPANY_PCT = 0.5;    // 0.5% → company support
export const DEPOSIT_TO_PERFORMANCE_PCT = 0.5; // 0.5% → better performance

// Reward wallet addresses
export const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
export const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
export const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";

// ─── Deposit Limits ────────────────────────────────────────────────────
export const MAX_DEPOSIT_PER_TX = 5_000; // $5,000 max per single deposit

// ─── Package Boundaries (2-package system) ───────────────────────────────
export const PKG1_MIN = 10;
export const PKG2_MIN = 2_500;

// ─── 7-Day Rotational Yield Schedule (% per day) ────────────────────────
export const YIELD_SCHEDULE: Record<number, { days: number[]; weeklyTotal: number; label: string; range: string }> = {
  1: {
    days: [1.00, 0.75, 0.95, 0.65, 1.00, 0.85, 0.55],
    weeklyTotal: 5.75,
    label: "Package 1",
    range: "$10 – $2,499",
  },
  2: {
    days: [1.15, 1.00, 1.15, 1.10, 1.05, 1.00, 1.25],
    weeklyTotal: 7.70,
    label: "Package 2",
    range: "$2,500 – $5,000+",
  },
};

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Rate Helpers ───────────────────────────────────────────────────────

/** Get package (1 or 2) for a given USDT amount (in whole units) */
export function getTier(amount: number): number {
  if (amount >= PKG2_MIN) return 2;
  return 1;
}

/** Get today's daily rate in basis points using 7-day rotational schedule */
export function getDailyRate(amount: number, nowTs = Math.floor(Date.now() / 1000)): number {
  const elapsed = nowTs - LAUNCH_TIMESTAMP;

  // After 3 months: lifetime 0.45% applies to ALL stakes
  if (elapsed >= LIFETIME_RATE_START) {
    return LIFETIME_RATE_BP;
  }

  // Day of week: 0=Monday, 6=Sunday (matches contract logic)
  const dayOfWeek = Math.floor(nowTs / 86400 + 3) % 7;
  const pkg = amount >= PKG2_MIN ? 2 : 1;
  const schedule = YIELD_SCHEDULE[pkg];

  // Convert percentage to bp (e.g. 1.00% → 100 bp)
  return Math.round(schedule.days[dayOfWeek] * 100);
}

/** Format a daily rate in bp to a human-readable percentage string */
export function formatRate(bp: number): string {
  return (bp / 100).toFixed(2) + "%";
}

/** Check if lifetime rate is active */
export function isLifetimeRateActive(nowTs = Math.floor(Date.now() / 1000)): boolean {
  return (nowTs - LAUNCH_TIMESTAMP) >= LIFETIME_RATE_START;
}

// ─── Referral ───────────────────────────────────────────────────────────
export const MAX_REFERRAL_LEVELS = 20;
export const QUALIFIED_DIRECT_MIN_DEPOSIT = 100; // $100 USDT
export const QUALIFIED_DIRECT_MIN_DEPOSIT_WEI = BigInt("100000000000000000000");

// Level unlock thresholds (qualified directs needed)
export const LEVEL_UNLOCK_THRESHOLDS = [
  { maxLevel: 3, required: 1 },
  { maxLevel: 8, required: 2 },
  { maxLevel: 12, required: 3 },
  { maxLevel: 16, required: 5 },
  { maxLevel: 20, required: 7 },
] as const;

// Commission rates by level (% of ROI/yield distributed as level income)
export const REFERRAL_COMMISSION_RATES: Record<string, { pct: number; bp: number }> = {
  "1": { pct: 30, bp: 3000 },
  "2": { pct: 20, bp: 2000 },
  "3-10": { pct: 10, bp: 1000 },
  "11-20": { pct: 5, bp: 500 },
};

// ─── Ranks ───────────────────────────────────────────────────────────────
export const RANK_CONFIG: Record<
  number,
  { label: string; turnoverRequired: number; bonusPct: number; bp: number }
> = {
  1: { label: "Bronze", turnoverRequired: 10_000, bonusPct: 1.0, bp: 100 },
  2: { label: "Silver", turnoverRequired: 25_000, bonusPct: 0.5, bp: 50 },
  3: { label: "Gold", turnoverRequired: 75_000, bonusPct: 0.3, bp: 30 },
  4: { label: "Platinum", turnoverRequired: 200_000, bonusPct: 0.2, bp: 20 },
  5: { label: "Diamond", turnoverRequired: 500_000, bonusPct: 0.15, bp: 15 },
  6: { label: "Master", turnoverRequired: 1_200_000, bonusPct: 0.1, bp: 10 },
  7: { label: "Grandmaster", turnoverRequired: 2_500_000, bonusPct: 0.05, bp: 5 },
};

// ─── DAO ────────────────────────────────────────────────────────────────
export const MAX_DAO_MEMBERS = 200;
export const DAO_TEAM_SIZE_REQUIREMENT = 250;
export const DAO_MONTHLY_ROYALTY_PCT = 0.5; // 0.5%

// ─── Rank Leg Ratio Qualification ───────────────────────────────────────
export const RANK_MAIN_LEG_MAX_PCT = 40; // Main leg max 40% of total
export const RANK_OTHER_LEGS_MIN_PCT = 60; // Other legs min 60% of total

// ─── Dynamic Yield Schedule Helper ──────────────────────────────────────
/**
 * Get today's yield rate (%) from the YIELD_SCHEDULE based on day-of-week and deposit amount.
 * Uses the same day-of-week logic as the contract (Unix timestamp / 86400 + 3) % 7.
 * Returns the percentage value directly (e.g. 1.00 for 1%).
 */
export function getTodayScheduleRate(amount: number): number {
  const nowTs = Math.floor(Date.now() / 1000);
  // Day of week: 0=Monday, 6=Sunday (matches contract)
  const dayOfWeek = Math.floor(nowTs / 86400 + 3) % 7;

  // Determine package: Package 1 ($10–$2,499) vs Package 2 ($2,500+)
  const pkg = amount >= PKG2_MIN ? 2 : 1;
  const schedule = YIELD_SCHEDULE[pkg];

  if (!schedule) return 0;
  return schedule.days[dayOfWeek] ?? 0;
}

// ─── Week Duration ──────────────────────────────────────────────────────
export const WEEK_DURATION = 7 * 86400; // 7 days in seconds
export const GENESIS_TIMESTAMP = 1704067200; // 2024-01-01 00:00:00 UTC (Monday)
