// OSLO Protocol Constants — mirrors OSLOConstants.sol

export const BASIS_POINTS = 10_000;

// ─── Token ──────────────────────────────────────────────────────────────
export const TOTAL_SUPPLY = 11_100_000;
export const TOTAL_SUPPLY_WEI = BigInt("11100000000000000000000000");

// ─── Fees ────────────────────────────────────────────────────────────
export const WITHDRAWAL_FEE_PCT = 10; // 10% on profit claims & early exits

// ─── Deposit Fund Split (98% LP / 2% Reward) ─────────────────────────
export const LIQUIDITY_FEE_BP = 9_800; // 98% to liquidity
export const OWNER_FEE_BP = 200; // 2% to reward wallet

// ─── Trial Period ───────────────────────────────────────────────────────
export const TRIAL_PERIOD_SECONDS = 10 * 86400; // 10 days
export const TRIAL_PENALTY_PCT = 10; // 10% early exit penalty

// ─── Sell Tax ───────────────────────────────────────────────────────────
export const SELL_TAX_PCT = 10; // 10%
export const SELL_TAX_TO_LP_PCT = 90; // 90% of sell tax
export const SELL_TAX_TO_BURN_PCT = 10; // 10% of sell tax

// ─── Return Cap ─────────────────────────────────────────────────────────
export const RETURN_CAP_MULTIPLIER = 3; // 3X

// ─── Launch Timestamp ───────────────────────────────────────────────────
// May 10, 2026 00:00:00 UTC
export const LAUNCH_TIMESTAMP = 1_778_371_200;

// ─── Time-Based ROI Phases ──────────────────────────────────────────────
export const PHASE1_DURATION = 90 * 86400;   // 0-3 months
export const PHASE2_DURATION = 180 * 86400;  // 3-6 months
export const PHASE3_DURATION = 270 * 86400;  // 6-9 months
export const PHASE4_DURATION = 365 * 86400;  // 9-12 months

// Phase flat rates (bp) — used after Phase 1
export const PHASE2_RATE = 200; // 2.00% daily (3-6 months)
export const PHASE3_RATE = 150; // 1.50% daily (6-9 months)
export const PHASE4_RATE = 100; // 1.00% daily (9-12 months)
export const PHASE5_RATE = 50;  // 0.50% daily (12+ months)

// ─── Reinvestment Cycle Rate Caps (bp) ──────────────────────────────────
export const CYCLE1_RATE = 200; // 2.00% (after 1st 3X)
export const CYCLE2_RATE = 150; // 1.50% (after 2nd 3X)
export const CYCLE3_RATE = 100; // 1.00% (after 3rd 3X)
export const CYCLE4_RATE = 50;  // 0.50% (after 4th+ 3X)

// ─── Time-Based Rate Helpers ────────────────────────────────────────────

/** Get the current time-based ROI phase (1-5) */
export function getCurrentPhase(nowTs = Math.floor(Date.now() / 1000)): number {
  const elapsed = nowTs - LAUNCH_TIMESTAMP;
  if (elapsed < 0) return 1;
  if (elapsed < PHASE1_DURATION) return 1;
  if (elapsed < PHASE2_DURATION) return 2;
  if (elapsed < PHASE3_DURATION) return 3;
  if (elapsed < PHASE4_DURATION) return 4;
  return 5;
}

/** Get the time-based daily rate (bp) for a given tier */
export function getTimeBasedRate(tier: number, nowTs?: number): number {
  const phase = getCurrentPhase(nowTs);
  if (phase === 1) return (TIER_DAILY_RATES[tier] || TIER_DAILY_RATES[1]);
  if (phase === 2) return PHASE2_RATE;
  if (phase === 3) return PHASE3_RATE;
  if (phase === 4) return PHASE4_RATE;
  return PHASE5_RATE;
}

/** Get the reinvestment cycle cap (bp) for a given cycle count */
export function getCycleCap(completedCycles: number): number {
  if (completedCycles === 0) return Infinity;
  if (completedCycles === 1) return CYCLE1_RATE;
  if (completedCycles === 2) return CYCLE2_RATE;
  if (completedCycles === 3) return CYCLE3_RATE;
  return CYCLE4_RATE;
}

/** Get the effective daily rate (bp) = min(time_rate, cycle_cap) */
export function getEffectiveRate(tier: number, completedCycles: number, nowTs?: number): number {
  const timeRate = getTimeBasedRate(tier, nowTs);
  const cycleCap = getCycleCap(completedCycles);
  return Math.min(timeRate, cycleCap);
}

/** Format a phase number to a human-readable label */
export function getPhaseLabel(phase: number): string {
  switch (phase) {
    case 1: return "Launch (Tier-Based)";
    case 2: return "3-6 Months (2.00%)";
    case 3: return "6-9 Months (1.50%)";
    case 4: return "9-12 Months (1.00%)";
    case 5: return "12+ Months (0.50%)";
    default: return "Unknown";
  }
}

// ─── Treasury Distribution ──────────────────────────────────────────────
export const TREASURY_TO_RANK_PCT = 0; // Rank bonus pool (no longer funded by Treasury)
export const TREASURY_TO_DAO_PCT = 0; // DAO royalty pool (no longer funded by Treasury)
export const TREASURY_TO_LP_PCT = 98; // 98% auto-liquidity
export const TREASURY_TO_OWNER_PCT = 2; // 2% reward wallet

// ─── Tier Boundaries (BUSD, wei) ────────────────────────────────────────
export const TIER_BOUNDARIES = {
  1: { min: 10, max: 499, minWei: BigInt("10000000000000000000") },
  2: { min: 500, max: 2499, minWei: BigInt("500000000000000000000") },
  3: { min: 2500, max: 4999, minWei: BigInt("2500000000000000000000") },
  4: { min: 5000, max: 9999, minWei: BigInt("5000000000000000000000") },
  5: { min: 10000, minWei: BigInt("10000000000000000000000") },
} as const;

// ─── Daily Rates (basis points) ─────────────────────────────────────────
export const TIER_DAILY_RATES: Record<number, number> = {
  1: 250, // 2.50%
  2: 275, // 2.75%
  3: 300, // 3.00%
  4: 325, // 3.25%
  5: 350, // 3.50%
};

// ─── Investment Return Rates (basis points) ─────────────────────────────
export const TIER_INVESTMENT_RATES: Record<number, number> = {
  1: 200, // 2.00%
  2: 225, // 2.25%
  3: 250, // 2.50%
  4: 275, // 2.75%
  5: 300, // 3.00%
};

export const PROFIT_RATE = 50; // 0.50% (same for all tiers)

// ─── Referral ───────────────────────────────────────────────────────────
export const REGISTRATION_FEE = 5; // $5 BUSD
export const REGISTRATION_FEE_WEI = BigInt("5000000000000000000");
export const MAX_REFERRAL_LEVELS = 20;
export const EARLY_ADOPTER_AIRDROP_THRESHOLD = 42_650;
export const QUALIFIED_DIRECT_MIN_DEPOSIT = 100; // $100 BUSD
export const QUALIFIED_DIRECT_MIN_DEPOSIT_WEI = BigInt("100000000000000000000");

// Airdrop tiers: [maxRegNumber, coinsEach]
export const AIRDROP_TIERS = [
  { maxReg: 2, coins: 10_000 },
  { maxReg: 12, coins: 5_000 },
  { maxReg: 32, coins: 2_500 },
  { maxReg: 50, coins: 1_500 },
  { maxReg: 150, coins: 1_000 },
  { maxReg: 1_150, coins: 250 },
  { maxReg: 7_650, coins: 50 },
  { maxReg: 22_650, coins: 20 },
  { maxReg: 42_650, coins: 10 },
] as const;

// ─── Airdrop Vesting ────────────────────────────────────────────────────
export const AIRDROP_VESTING_THRESHOLD = 150; // First 150 registrants subject to 1%/month vesting
export const AIRDROP_VESTING_RATE_PCT = 1; // 1% per month
export const AIRDROP_VESTING_INTERVAL = 30 * 86400; // 30 days in seconds
export const AIRDROP_FULL_VESTING_MONTHS = 100; // 100 months for full vesting

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

// ─── Week Duration ──────────────────────────────────────────────────────
export const WEEK_DURATION = 7 * 86400; // 7 days in seconds
export const GENESIS_TIMESTAMP = 1704067200; // 2024-01-01 00:00:00 UTC (Monday)
