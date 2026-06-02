// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OSLOConstants
/// @notice All hardcoded protocol constants for the OSLO Protocol V2
/// @dev USDT-based staking, 4-tier ranged yields, lifetime 0.45% rate, combined 3X cap
library OSLOConstants {
    // ─── Token Supply ───────────────────────────────────────────────────
    uint256 public constant TOTAL_SUPPLY = 11_100_000 * 1e18;       // 11.1M total
    uint256 public constant CONTRACT_RESERVE = 11_000_000 * 1e18;   // 11M held by InvestmentEngine
    uint256 public constant DEX_ALLOCATION = 100_000 * 1e18;        // 100K seeded to OSLODEX with USDT pair

    // ─── Basis Points (10000 = 100%) ────────────────────────────────────
    uint256 public constant BASIS_POINTS = 10_000;

    // ─── Withdrawal Fees ────────────────────────────────────────────────
    uint256 public constant WITHDRAWAL_FEE_BP = 1_000; // 10% on profit claims

    // ─── Minimum Withdrawal Threshold ───────────────────────────────────
    uint256 public constant MIN_WITHDRAWAL_THRESHOLD = 10 * 1e18; // $10 USDT minimum to withdraw

    // ─── Sell Tax ───────────────────────────────────────────────────────
    // On every sell/swap, tokens are distributed:
    //   10% fee → burned (the fee is paid by burning tokens)
    //   70% → InvestmentEngine (contract reserve for rewards)
    //   20% → additionally burned (deflationary)
    //   Total burn per sell = 30% (until burn cap is reached)
    //   USDT from the swap stays in the DEX as liquidity.
    uint256 public constant SELL_TAX_BP = 1_000;         // 10% sell tax (burned as fee)
    uint256 public constant SELL_TAX_TO_CONTRACT_BP = 7_000; // 70% → InvestmentEngine (contract reserve)
    uint256 public constant SELL_TAX_TO_BURN_BP = 2_000;     // 20% additional burn
    uint256 public constant SELL_TAX_FEE_BURN_BP = 1_000;    // 10% fee → burned (was LP, now burn)

    // ─── 3X Return Cap ──────────────────────────────────────────────────
    uint256 public constant RETURN_CAP_MULTIPLIER = 3; // 3X combined cap on all earnings

    // ─── Treasury Distribution ──────────────────────────────────────────
    uint256 public constant TREASURY_TO_RANK_BP = 0;      // 0% → (paid from Liquidity)
    uint256 public constant TREASURY_TO_DAO_BP = 0;       // 0% → (paid from Liquidity)
    uint256 public constant TREASURY_TO_LP_BP = 10_000;   // 100% → liquidity

    // ─── Deposit Fee Split (2% total to reward wallets) ───────────────
    uint256 public constant DEPOSIT_TO_DEX_BP = 9_800;        // 98% → DEX liquidity
    uint256 public constant DEPOSIT_TO_REWARD_BP = 100;       // 1.0% → reward wallet
    uint256 public constant DEPOSIT_TO_COMPANY_BP = 50;       // 0.5% → company support
    uint256 public constant DEPOSIT_TO_PERFORMANCE_BP = 50;   // 0.5% → better performance

    // ─── Referral Commissions (basis points on profit portion) ──────────
    uint256 public constant MAX_REFERRAL_LEVELS = 20;
    uint256 public constant QUALIFIED_DIRECT_MIN_DEPOSIT = 10 * 1e18; // $10 USDT

    // ─── DAO ────────────────────────────────────────────────────────────
    uint256 public constant MAX_DAO_MEMBERS = 200;
    uint256 public constant DAO_TEAM_SIZE_REQUIREMENT = 250;
    uint256 public constant DAO_MONTHLY_ROYALTY_BP = 50; // 0.5% monthly royalty

    // ─── Governance ─────────────────────────────────────────────────────
    uint256 public constant PROPOSAL_THRESHOLD_BP = 100;     // 1% of supply
    uint256 public constant VOTING_PERIOD_BLOCKS = 86_400;   // ~3 days at 3s blocks
    uint256 public constant TIMELOCK_DELAY = 48 hours;

    // ─── Week Duration ──────────────────────────────────────────────────
    uint256 public constant WEEK_DURATION = 7 days;

    // ─── Dead Address ───────────────────────────────────────────────────
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ─── Burn Cap ───────────────────────────────────────────────────────
    uint256 public constant MAX_BURN_SUPPLY = 9_990_000 * 1e18;   // 90% of 11.1M — stop burning when this much is burned
    uint256 public constant MIN_REMAINING_SUPPLY = 1_110_000 * 1e18; // 10% of 11.1M — minimum tokens remaining after burn

    // ─── Early Exit Period ───────────────────────────────────────────────
    uint256 public constant EARLY_EXIT_PERIOD = 10 days;           // 10-day early exit window
    uint256 public constant EARLY_EXIT_FEE_BP = 1_000;             // 10% early exit fee

    // ─── Investment Package Boundaries (in USDT, 18 decimals) ──────────────
    uint256 public constant MAX_DEPOSIT_PER_TX = 5_000 * 1e18; // $5,000 max per single deposit
    uint256 public constant MAX_TOTAL_DEPOSIT_PER_USER = 5_000 * 1e18; // $5,000 max total per wallet
    uint256 public constant PKG1_MIN = 10 * 1e18;       // Package 1 minimum ($10)
    uint256 public constant PKG2_MIN = 2_500 * 1e18;    // Package 2 minimum ($2,500)

    // ─── 7-Day Rotational Yield Rates (basis points) ──────────────────────
    // Package 1: $10 – $2,499 (Mon-Sun)
    uint256 public constant PKG1_MON = 100;  // 1.00%
    uint256 public constant PKG1_TUE = 75;   // 0.75%
    uint256 public constant PKG1_WED = 95;   // 0.95%
    uint256 public constant PKG1_THU = 65;   // 0.65%
    uint256 public constant PKG1_FRI = 100;  // 1.00%
    uint256 public constant PKG1_SAT = 85;   // 0.85%
    uint256 public constant PKG1_SUN = 55;   // 0.55%
    uint256 public constant PKG1_WEEKLY_TOTAL = 575; // 5.75% weekly

    // Package 2: $2,500 – $5,000+ (Mon-Sun)
    uint256 public constant PKG2_MON = 115;  // 1.15%
    uint256 public constant PKG2_TUE = 100;  // 1.00%
    uint256 public constant PKG2_WED = 115;  // 1.15%
    uint256 public constant PKG2_THU = 110;  // 1.10%
    uint256 public constant PKG2_FRI = 105;  // 1.05%
    uint256 public constant PKG2_SAT = 100;  // 1.00%
    uint256 public constant PKG2_SUN = 125;  // 1.25%
    uint256 public constant PKG2_WEEKLY_TOTAL = 770; // 7.70% weekly

    // ─── Lifetime Rate (after 3 months, applies to ALL stakes) ───────────
    uint256 public constant LIFETIME_RATE = 45;           // 0.45% daily
    uint256 public constant LIFETIME_RATE_START = 90 days; // 3 months after launch

    // ─── Launch Timestamp ───────────────────────────────────────────────
    // Same as V1: May 10, 2026 00:00:00 UTC
    uint256 public constant LAUNCH_TIMESTAMP = 1_778_371_200;

    // ─── Referral Commission Rates (basis points) ───────────────────────
    uint256 public constant REFERRAL_L1_BP = 3_000;   // 30%   (level 1)
    uint256 public constant REFERRAL_L2_BP = 2_000;   // 20%   (level 2)
    uint256 public constant REFERRAL_L3_10_BP = 1_000; // 10%   (levels 3–10)
    uint256 public constant REFERRAL_L11_20_BP = 500;  // 5%    (levels 11–20)

    // ─── Rank Turnover Thresholds (in USDT, 18 decimals) ────────────────
    uint256 public constant RANK1_TURNOVER = 10_000 * 1e18;
    uint256 public constant RANK2_TURNOVER = 25_000 * 1e18;
    uint256 public constant RANK3_TURNOVER = 75_000 * 1e18;
    uint256 public constant RANK4_TURNOVER = 200_000 * 1e18;
    uint256 public constant RANK5_TURNOVER = 500_000 * 1e18;
    uint256 public constant RANK6_TURNOVER = 1_200_000 * 1e18;
    uint256 public constant RANK7_TURNOVER = 2_500_000 * 1e18;

    // ─── Rank Bonus Percentages (basis points) ──────────────────────────
    uint256 public constant RANK1_BONUS_BP = 100; // 1.00% (Bronze)
    uint256 public constant RANK2_BONUS_BP = 50;  // 0.50% (Silver)
    uint256 public constant RANK3_BONUS_BP = 30;  // 0.30% (Gold)
    uint256 public constant RANK4_BONUS_BP = 20;  // 0.20% (Platinum)
    uint256 public constant RANK5_BONUS_BP = 15;  // 0.15% (Diamond)
    uint256 public constant RANK6_BONUS_BP = 10;  // 0.10% (Master)
    uint256 public constant RANK7_BONUS_BP = 5;   // 0.05% (Grandmaster)

    // ─── Rank Leg Ratio Qualification (basis points) ────────────────────
    uint256 public constant RANK_MAIN_LEG_MAX_BP = 4_000;  // 40% — main leg cap
    uint256 public constant RANK_OTHER_LEGS_MIN_BP = 6_000; // 60% — other legs minimum
}
