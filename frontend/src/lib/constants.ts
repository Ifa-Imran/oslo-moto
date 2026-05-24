// OSLO Protocol V2 Constants — mirrors OSLOConstants.sol
// USDT-based, 4-tier ranged yields, lifetime 0.45% rate, combined 3X cap

export const BASIS_POINTS = 10_000;

// ─── Token ──────────────────────────────────────────────────────────────
export const TOTAL_SUPPLY = 11_100_000;
export const TOTAL_SUPPLY_WEI = BigInt("11100000000000000000000000");
export const CONTRACT_RESERVE = 11_000_000;
export const DEX_ALLOCATION = 100_000;

// ─── Fees ───────────────────────────────────────────────────────────────
export const WITHDRAWAL_FEE_PCT = 10; // 10% on profit claims
export const MIN_WITHDRAWAL_THRESHOLD = 10; // $10 USDT minimum

// ─── Sell Tax / Swap Fee Distribution (V3) ───────────────────────────────
// On every sell: 10% fee burned + 20% deflationary burn + 70% to contract
// Total burn per sell = 30% (fee paid in tokens, USDT stays in DEX as liquidity)
export const SELL_TAX_PCT = 10; // 10% fee → burned
export const SWAP_TO_CONTRACT_PCT = 70; // 70% → InvestmentEngine (contract reserve)
export const SWAP_TO_BURN_PCT = 20; // 20% → additional deflationary burn
export const SWAP_TOTAL_BURN_PCT = 30; // 10% fee + 20% burn = 30% total burned per sell

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

// ─── Deposit Limits ────────────────────────────────────────────────────
export const MAX_DEPOSIT_PER_TX = 5_000; // $5,000 max per single deposit

// ─── Tier Boundaries (USDT, 4 tiers with ranged rates) ───────────────────
export const TIER_BOUNDARIES = {
  1: { min: 10, max: 499, minWei: BigInt("10000000000000000000"), maxWei: BigInt("499000000000000000000") },
  2: { min: 500, max: 2499, minWei: BigInt("500000000000000000000"), maxWei: BigInt("2499000000000000000000000") },
  3: { min: 2500, max: 4999, minWei: BigInt("2500000000000000000000"), maxWei: BigInt("4999000000000000000000000") },
  4: { min: 5000, minWei: BigInt("5000000000000000000000") }, // $5,000+ (no upper bound for entry)
} as const;

// ─── Tier 4 Implicit Max (for rate interpolation cap) ────────────────────
export const TIER4_IMPLICIT_MAX = 50_000;
export const TIER4_IMPLICIT_MAX_WEI = BigInt("50000000000000000000000");

// ─── Daily Rate Ranges (basis points) per Tier ──────────────────────────
export const TIER_RATE_RANGES: Record<number, { min: number; max: number }> = {
  1: { min: 50, max: 100 },   // 0.50% – 1.00%
  2: { min: 75, max: 115 },   // 0.75% – 1.15%
  3: { min: 100, max: 150 },  // 1.00% – 1.50%
  4: { min: 100, max: 175 },  // 1.00% – 1.75%
};

// ─── Rate Helpers ───────────────────────────────────────────────────────

/** Get tier (1-4) for a given USDT amount (in whole units) */
export function getTier(amount: number): number {
  if (amount >= 5000) return 4;
  if (amount >= 2500) return 3;
  if (amount >= 500) return 2;
  return 1;
}

/** Linear interpolation within a tier's rate range */
function interpolateRate(
  amount: number,
  minAmt: number,
  maxAmt: number,
  minRate: number,
  maxRate: number
): number {
  if (maxAmt <= minAmt) return minRate;
  const rateRange = maxRate - minRate;
  const amtRange = maxAmt - minAmt;
  return minRate + ((amount - minAmt) * rateRange) / amtRange;
}

/** Get the V2 daily rate (bp) for a given deposit amount (in whole USDT units) */
export function getDailyRate(amount: number, nowTs = Math.floor(Date.now() / 1000)): number {
  const elapsed = nowTs - LAUNCH_TIMESTAMP;

  // After 3 months: lifetime 0.45% applies to ALL stakes
  if (elapsed >= LIFETIME_RATE_START) {
    return LIFETIME_RATE_BP;
  }

  const tier = getTier(amount);
  const range = TIER_RATE_RANGES[tier];

  switch (tier) {
    case 1:
      return interpolateRate(amount, 10, 499, range.min, range.max);
    case 2:
      return interpolateRate(amount, 500, 2499, range.min, range.max);
    case 3:
      return interpolateRate(amount, 2500, 4999, range.min, range.max);
    case 4: {
      const capped = Math.min(amount, TIER4_IMPLICIT_MAX);
      return interpolateRate(capped, 5000, TIER4_IMPLICIT_MAX, range.min, range.max);
    }
    default:
      return range.min;
  }
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

// Commission rates by level (% as displayed, BP for calculation)
export const REFERRAL_COMMISSION_RATES: Record<string, { pct: number; bp: number }> = {
  "1": { pct: 30, bp: 3000 },
  "2": { pct: 20, bp: 2000 },
  "3-10": { pct: 1, bp: 100 },
  "11-15": { pct: 0.5, bp: 50 },
  "16-20": { pct: 0.25, bp: 25 },
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

// ─── Week Duration ──────────────────────────────────────────────────────
export const WEEK_DURATION = 7 * 86400; // 7 days in seconds
export const GENESIS_TIMESTAMP = 1704067200; // 2024-01-01 00:00:00 UTC (Monday)
