# OSLO Protocol — Final Blueprint

> **Version:** 6.0 (Mainnet-Ready)  
> **Network:** BSC Mainnet (Chain ID: 56)  
> **Launch Date:** May 10, 2026 00:00:00 UTC  
> **Base Currency:** USDT (BEP-20) `0x55d398326f99059fF775485246999027B3197955`

---

## 1. Executive Summary

OSLO Protocol is a BSC-based DeFi staking and multi-level referral platform. Users deposit USDT, earn tiered daily yields (paid in OSLO tokens) up to 3X their principal, build referral networks across 20 levels, and access rank bonuses and DAO royalties. The system operates via protocol-owned liquidity through a custom DEX (OSLODEX), featuring deflationary tokenomics with a 10% sell tax burned on every OSLO sale.

### Core Design Principles

| Principle | Detail |
|---|---|
| **No deposit fee** | 100% of USDT deposited is staked |
| **Principal locked after trial** | 10-day early exit window; after that only profit claims |
| **No withdrawal fee** | Full yield auto-bought into OSLO at DEX rate |
| **3X combined cap** | Each deposit stops yielding at 3X of its principal (all income sources) |
| **Immutable after setup** | Admin renounced via `completeSetup()`; only Timelock controls emergency |
| **Deflationary token** | 30% total burn per sell (10% tax + 20% additional) |

---

## 2. Architecture

### 2.1 Contract Stack (8 Contracts + 1 Library)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OSLOConstants (Library)                            │
│   All protocol parameters: rates, tiers, fees, thresholds, time      │
└─────────────────────────────────────────────────────────────────────┘
                                │
    ┌───────────┬───────────────┼───────────────┬─────────────┐
    ▼           ▼               ▼               ▼             ▼
┌──────────┐ ┌────────────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐
│OSLOToken │ │InvestmentEngine│ │OSLOReferral│ │RankSystem│ │OSLODEX       │
│(BEP-20)  │ │(Staking Core)  │ │(20 levels) │ │(7 ranks) │ │(Custom DEX)  │
│11.1M     │ │Deposit/Claim   │ │$1 reg fee  │ │Weekly    │ │USDT↔OSLO     │
│10% sell  │ │3X per-deposit  │ │Commissions │ │Turnover  │ │Constant      │
│tax→burn  │ │Tier yield      │ │Level unlock│ │40/60 leg │ │Product       │
└──────────┘ └────────────────┘ └────────────┘ └──────────┘ └──────────────┘
                    │                   │              │              │
                    ▼                   ▼              ▼              │
             ┌───────────┐      ┌──────────┐                        │
             │ OSLODAO   │      │ Treasury │                        │
             │ (200 max) │      │(Fee Router)                       │
             │ Monthly   │      │100%→LP   │                        │
             │ Royalties │      └──────────┘                        │
             └───────────┘              │                           │
                                        ▼                           │
                                 ┌──────────────┐                   │
                                 │LiquidityMgr  │───────────────────┘
                                 │Protocol LP   │
                                 └──────────────┘
```

### 2.2 Data Flow Diagram

```
USER deposits USDT
       │
       ▼
InvestmentEngine ──── USDT ────► OSLODEX (liquidity grows)
       │                             │
       │ ◄─── OSLO returned ─────────┘
       │
       ├──► RankSystem.recordTurnover(upline, amount) × 20 levels
       │
       └──► Referral.checkAndUnlockLevels(user)

USER claims rewards
       │
       ▼
InvestmentEngine ── calculates USDT yield ──► converts to OSLO at DEX rate
       │                                          │
       │ ◄──── OSLO tokens sent to user ──────────┘
       │
       └──► Referral.distributeReferralCommission(user, yieldAmount)
                    │
                    └──► walks 20 upline levels, accrues USDT commissions
                              │
                              └──► InvestmentEngine.notifyLevelIncome(upline, amount)

USER sells OSLO on OSLODEX
       │
       ▼
OSLOToken._update() ── burns 10% (sell tax) ──► 0xdead
       │
       ▼ (90% reaches DEX)
OSLODEX.swapOSLOForUSDT()
       ├── 20% additionally burned ──► 0xdead
       ├── 70% ──► InvestmentEngine (recycled for future rewards)
       └── 10% ──► stays in DEX as LP
```

---

## 3. Token Economics

### 3.1 OSLO Token

| Property | Value |
|---|---|
| **Name** | OSLO Protocol |
| **Symbol** | OSLO |
| **Standard** | BEP-20 (OpenZeppelin v5 ERC20 + ERC20Burnable) |
| **Total Supply** | 11,100,000 OSLO (fixed, no mint) |
| **Decimals** | 18 |
| **Contract Reserve** | 11,000,000 OSLO → InvestmentEngine |
| **DEX Seed** | 100,000 OSLO → LiquidityManager → OSLODEX |

### 3.2 Deflationary Mechanics

| Event | Burn Amount |
|---|---|
| Sell tax (10% of transfer) | Burned to 0xdead |
| DEX additional burn (20% of received OSLO) | Burned to 0xdead |
| **Total per sell** | **30% of declared OSLO amount** |
| Burn cap | 9,990,000 OSLO (90% of supply) |
| Minimum circulating | 1,110,000 OSLO (10% of supply) |

### 3.3 Token Distribution Flow

```
Deploy: 11,100,000 OSLO minted to deployer
    ├── 11,000,000 OSLO → InvestmentEngine (reward reserve)
    └──    100,000 OSLO → LiquidityManager → OSLODEX (paired with 900 USDT)
```

---

## 4. Investment Engine

### 4.1 Deposit Model

| Parameter | Value |
|---|---|
| Minimum deposit | $10 USDT |
| Maximum per transaction | $5,000 USDT |
| Deposit fee | 0% (full amount staked) |
| Currency | USDT (BEP-20) |

### 4.2 Tier-Based Daily Yields (First 3 Months)

Rates are linearly interpolated within each tier's range:

| Tier | Deposit Range | Daily Rate Range |
|---|---|---|
| 1 | $10 – $499 | 0.50% – 1.00% |
| 2 | $500 – $2,499 | 0.75% – 1.15% |
| 3 | $2,500 – $4,999 | 1.00% – 1.50% |
| 4 | $5,000+ | 1.00% – 1.75% |

**Rate Formula:** `rate = minRate + (amount - minAmt) × (maxRate - minRate) / (maxAmt - minAmt)`

Tier 4 interpolation is capped at $50,000 implicit max to prevent excessive yields.

### 4.3 Lifetime Rate (After 90 Days from Launch)

| Parameter | Value |
|---|---|
| Activation | 90 days after May 10, 2026 (August 8, 2026) |
| Rate | 0.45% daily (45 bp) |
| Applies to | ALL deposits (new and existing) regardless of tier |

### 4.4 Per-Deposit 3X Cap (Combined)

Each deposit has a maximum return of **3× principal**. This cap tracks ALL income:
- Daily yield claims
- Referral commissions (notified via `notifyLevelIncome`)
- Rank bonuses (notified via `notifyRankBonus`)

Once `totalCombinedEarnings >= deposit.amount × 3`, the deposit deactivates permanently.

### 4.5 Reward Claim Flow

1. User calls `claimRewards(depositIndex)`
2. Pending USDT calculated: `(amount × rate × elapsed) / (1 day × 10000)`
3. Combined 3X cap checked — pending capped if needed
4. OSLO equivalent calculated at DEX spot rate
5. OSLO transferred from InvestmentEngine reserve to user
6. Referral commissions distributed on full pending amount
7. No withdrawal fee applied

### 4.6 Early Exit (10-Day Window)

| Parameter | Value |
|---|---|
| Window | 10 days from deposit |
| Exit fee | 10% of principal |
| Yield deduction | All accrued yield deducted from principal |
| Return currency | USDT (not OSLO) |

**Formula:** `netReturn = principal - accruedYield - (principal × 10%)`

After 10 days, the `earlyExit()` function reverts with `NotInEarlyExitPeriod`.

### 4.7 DEX Auto-Refill Mechanism

When a deposit is processed, InvestmentEngine checks if OSLODEX has sufficient OSLO:
- Estimates OSLO needed for the deposit
- Maintains 1,000 OSLO minimum buffer
- If shortfall detected, transfers OSLO from IE reserve to DEX via `replenishOsloReserve()`

---

## 5. OSLODEX (Custom DEX)

### 5.1 Overview

Protocol-controlled liquidity. No external AMM integration. Single trading pair: USDT/OSLO.

### 5.2 Pricing Model

**Constant Product:** `output = (inputAmount × outputReserve) / (inputReserve + inputAmount)`

**Price:** `usdtReserve × 1e18 / osloReserve` (USDT per OSLO, 18 decimals)

### 5.3 Swap Functions

| Function | Access | Fee | Description |
|---|---|---|---|
| `swapOSLOForUSDT()` | Public | 10% sell tax (burned) | User sells OSLO for USDT |
| `swapUSDTForOSLO()` | IE + Referral only | None | Protocol operations only |
| `swapYieldForOSLO()` | IE only | None | Tax-free yield auto-buy |
| `processDeposit()` | IE only | None | Deposit routing (USDT in, OSLO out) |
| `processWithdrawal()` | IE only | None | Early exit routing (OSLO in, USDT out) |

### 5.4 OSLO Sell Distribution (of 90% received after tax)

| Destination | Share | Purpose |
|---|---|---|
| Burn (0xdead) | 20% | Deflationary |
| InvestmentEngine | 70% | Recycled for future reward payouts |
| DEX LP | 10% | Grows liquidity reserves |

### 5.5 Registration Fee Injection

`injectUSDTLiquidity()` — called by Referral contract. Adds $1 USDT directly to reserves without removing OSLO. Pure price-positive injection.

---

## 6. Referral System (20 Levels)

### 6.1 Registration

| Parameter | Value |
|---|---|
| Fee | $1 USDT |
| Fee destination | Injected into OSLODEX as pure liquidity |
| Referrer requirement | Must be already registered |
| Self-referral | Blocked |

### 6.2 Level Unlocking

Auto-triggered after deposits/exits. Based on **qualified direct referrals** (directs with ≥$100 USDT active deposit):

| Qualified Directs | Max Level Unlocked |
|---|---|
| 1 | 3 |
| 2 | 8 |
| 3 | 12 |
| 5 | 16 |
| 7+ | 20 |

### 6.3 Commission Rates

| Level | Commission Rate |
|---|---|
| Level 1 | 30% of yield |
| Level 2 | 20% of yield |
| Levels 3–10 | 1.00% each |
| Levels 11–15 | 0.50% each |
| Levels 16–20 | 0.25% each |

**Total if all 20 levels active:** 30 + 20 + 8×1 + 5×0.5 + 5×0.25 = 61.75%

Commissions are based on the **full yield amount** (USDT-denominated). Accumulated in `referralRewards` mapping (pull-based). Users call `claimReferralRewards()` to withdraw USDT.

---

## 7. Rank System (7 Progressive Ranks)

### 7.1 Weekly Turnover Tracking

- `recordTurnover()` called by InvestmentEngine for every deposit
- Records for all 20 upline ancestors
- Week ID: `(block.timestamp - genesisTimestamp) / 7 days + 1`
- Genesis: January 1, 2024 00:00 UTC (Monday)

### 7.2 Rank Thresholds

| Rank | Name | Weekly Turnover | Bonus Rate |
|---|---|---|---|
| 1 | Bronze | $10,000 | 1.00% |
| 2 | Silver | $25,000 | 0.50% |
| 3 | Gold | $75,000 | 0.30% |
| 4 | Platinum | $200,000 | 0.20% |
| 5 | Diamond | $500,000 | 0.15% |
| 6 | Master | $1,200,000 | 0.10% |
| 7 | Grandmaster | $2,500,000 | 0.05% |

### 7.3 40/60 Leg Ratio Qualification

- Main leg (direct with highest turnover) must be ≤40% of total
- Other legs combined must be ≥60%
- Re-checked each week; failing disqualifies from that week's bonus

### 7.4 Bonus Calculation

`bonus = weeklyTurnover × rankBonusBP / 10000`

Paid in USDT from `bonusPoolBalance`. Notifies InvestmentEngine for combined 3X cap.

---

## 8. DAO System

### 8.1 Membership

| Parameter | Value |
|---|---|
| Max members | 200 |
| Qualification | Team size ≥ 250 |
| Permanence | Once qualified, cannot be removed |

### 8.2 Monthly Royalties

| Parameter | Value |
|---|---|
| Royalty rate | 0.5% of monthly protocol turnover |
| Distribution | Equal split among all DAO members |
| Claim period | Previous completed month only |
| Payment | USDT directly |

Month ID: `(block.timestamp - genesisTimestamp) / 30 days + 1`

---

## 9. Treasury

### 9.1 Current Model (V2)

| Destination | Share |
|---|---|
| Liquidity | 100% |
| Rank System | 0% (paid from LP directly) |
| DAO | 0% (paid from LP directly) |

Treasury is autonomous — no EOA can withdraw USDT or OSLO. Only Timelock can rescue non-protocol tokens.

---

## 10. Security Model

### 10.1 Access Control

| Phase | Control |
|---|---|
| Pre-setup | Admin (deployer) — configure contracts |
| Post-setup | Admin renounced (address(0)) |
| Emergency | Timelock only — pause deposits, rescue non-protocol tokens |
| All user functions | Permissionless |

### 10.2 Safety Guarantees

| Guarantee | Mechanism |
|---|---|
| No admin rug pull | Admin renounced after `completeSetup()` |
| No Treasury drain | USDT + OSLO explicitly blocked from `rescueERC20()` |
| No LP withdrawal | All LP permanently in DEX |
| No minting | Fixed supply, no mint function |
| No reentrancy | All state-changing functions use `nonReentrant` |
| Principal protection | After 10-day trial, only profit claims available |
| Emergency pause | Timelock can pause deposits only (not claims) |

### 10.3 Timelock-Controlled Functions

- `setDepositsPaused(bool)` — pause/unpause new deposits
- `setMinClaimThreshold(uint256)` — adjust minimum claim amount
- `setReferral(address)` — update referral contract
- `setInvestmentEngine(address)` — update IE on token/DEX/rank
- `rescueERC20(token, amount)` — rescue non-protocol tokens from Treasury/LiquidityMgr

---

## 11. Protocol Constants (Complete Reference)

### 11.1 Token & Supply

```
TOTAL_SUPPLY           = 11,100,000 OSLO
CONTRACT_RESERVE       = 11,000,000 OSLO (InvestmentEngine)
DEX_ALLOCATION         =    100,000 OSLO (LiquidityManager → DEX)
MAX_BURN_SUPPLY        =  9,990,000 OSLO (90% burn cap)
MIN_REMAINING_SUPPLY   =  1,110,000 OSLO (10% floor)
```

### 11.2 Fees & Tax

```
SELL_TAX_BP            = 1,000  (10% sell tax → burned)
SELL_TAX_TO_CONTRACT_BP= 7,000  (70% of received → IE)
SELL_TAX_TO_BURN_BP    = 2,000  (20% of received → burn)
WITHDRAWAL_FEE_BP      = 1,000  (10% — currently unused in V3)
EARLY_EXIT_FEE_BP      = 1,000  (10% on principal during trial)
EARLY_EXIT_PERIOD      = 10 days
```

### 11.3 Investment

```
MAX_DEPOSIT_PER_TX     = $5,000 USDT
TIER1: $10–$499        → 0.50%–1.00% daily
TIER2: $500–$2,499     → 0.75%–1.15% daily
TIER3: $2,500–$4,999   → 1.00%–1.50% daily
TIER4: $5,000+         → 1.00%–1.75% daily (capped at $50K for interpolation)
LIFETIME_RATE          = 45 bp (0.45% daily, after 90 days)
RETURN_CAP_MULTIPLIER  = 3 (3X per-deposit cap)
LAUNCH_TIMESTAMP       = 1,778,371,200 (May 10, 2026 00:00 UTC)
```

### 11.4 Referral

```
MAX_REFERRAL_LEVELS    = 20
REGISTRATION_FEE       = $1 USDT
QUALIFIED_DIRECT_MIN   = $100 USDT active deposit
L1: 3,000 bp (30%)    L2: 2,000 bp (20%)
L3–L10: 100 bp (1%)   L11–L15: 50 bp (0.50%)   L16–L20: 25 bp (0.25%)
```

### 11.5 Rank System

```
RANK1_TURNOVER = $10,000     RANK1_BONUS_BP = 100 (1.00%)
RANK2_TURNOVER = $25,000     RANK2_BONUS_BP = 50  (0.50%)
RANK3_TURNOVER = $75,000     RANK3_BONUS_BP = 30  (0.30%)
RANK4_TURNOVER = $200,000    RANK4_BONUS_BP = 20  (0.20%)
RANK5_TURNOVER = $500,000    RANK5_BONUS_BP = 15  (0.15%)
RANK6_TURNOVER = $1,200,000  RANK6_BONUS_BP = 10  (0.10%)
RANK7_TURNOVER = $2,500,000  RANK7_BONUS_BP = 5   (0.05%)
RANK_MAIN_LEG_MAX_BP = 4,000 (40%)
WEEK_DURATION = 7 days
Genesis = Jan 1, 2024 00:00 UTC
```

### 11.6 DAO

```
MAX_DAO_MEMBERS         = 200
DAO_TEAM_SIZE_REQUIREMENT = 250
DAO_MONTHLY_ROYALTY_BP  = 50 (0.5%)
```

### 11.7 Governance

```
PROPOSAL_THRESHOLD_BP   = 100 (1% of supply)
VOTING_PERIOD_BLOCKS    = 86,400 (~3 days)
TIMELOCK_DELAY          = 48 hours
```

---

## 12. Frontend Architecture

### 12.1 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Blockchain | wagmi v2 + viem |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| State | Zustand (global) + React hooks (local) |
| Chain | BSC Mainnet only |
| RPC | `https://bsc-dataseed.binance.org/` |

### 12.2 Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard — registration, protocol stats, user portfolio |
| `/invest` | Deposit USDT, view active deposits, claim rewards, early exit |
| `/referrals` | Referral tree, level unlocking, commission tracking, claim |
| `/ranks` | Weekly turnover, rank status, bonus claiming |
| `/dao` | DAO membership, monthly royalties |
| `/swap` | OSLO↔USDT trading (sell OSLO for USDT) |
| `/treasury` | Protocol fee distribution stats |

### 12.3 Hooks

| Hook | Purpose |
|---|---|
| `useInvestmentEngineReads` | Tier, deposits, pending rewards, totals |
| `useInvestmentEngineWrites` | deposit, claimRewards, earlyExit |
| `useReferralReads` | Registration, tree, commissions, levels |
| `useReferralWrites` | register, claimReferralRewards |
| `useRankSystem` | Rank, turnover, bonus |
| `useDAO` | Membership, royalty |
| `useLiquidityManager` | Pool stats |
| `useOSLODEX` | Price, reserves, swap quotes |
| `useToken` | Balance, supply, burned |

---

## 13. Subgraph (The Graph)

### 13.1 Network

BSC Mainnet (`network: bsc`)

### 13.2 Indexed Entities

| Entity | Description |
|---|---|
| `ProtocolStat` | Singleton global counters |
| `User` | Registration, referral tree, totals |
| `Deposit` | Per-user staking records |
| `ReferralPayment` | Level-by-level commission history |
| `RankAchievement` | Weekly rank milestones |
| `RankBonusClaim` | Weekly bonus claims |
| `DAOMember` | Membership records |
| `RoyaltyClaim` | Monthly royalty payouts |
| `TreasuryDistribution` | Fee routing events |
| `SellTax` | OSLO burn events |
| `LiquidityEvent` | DEX liquidity changes |
| `WeeklyTurnover` | Per-user weekly aggregate |
| `Withdrawal` | Early exit records |

---

## 14. Deployment Procedure

### 14.1 Prerequisites

- Deployer wallet funded with BNB (gas) + ≥1,000 USDT (DEX seed liquidity)
- Private key in `contracts/.env`
- Testnet snapshot file at `contracts/data/testnet-snapshot.json` (optional)

### 14.2 Deployment Steps (14 Steps)

1. **Deploy OSLOToken** — 11.1M minted to deployer
2. **Deploy OSLODEX** — `(usdt, oslo)`
3. **Deploy OSLOTreasury** — `(usdt, oslo)`
4. **Deploy OSLOLiquidityManager** — `(usdt, oslo)`
5. **Deploy OSLODAO** — `(usdt)`
6. **Deploy OSLORankSystem** — `(usdt)`
7. **Deploy OSLOReferral** — `(usdt, oslo)`
8. **Deploy OSLOInvestmentEngine** — `(usdt, oslo, launchTimestamp)`
9. **Wire cross-contract addresses** — configure() on all contracts
10. **Configure OSLOToken** — sell tax addresses, whitelist, sell endpoint
11. **Transfer token allocations** — 11M→IE, 100K→LiquidityManager
12. **Seed DEX liquidity** — 1,000 USDT + 100K OSLO via LiquidityManager
13. **Migrate testnet users** — batch `migrateUsers()` (referral tree only)
14. **Complete setup** — `completeSetup()` on all 8 contracts (admin renounced)

### 14.3 Post-Deployment

1. Update `frontend/src/lib/contracts.ts` with deployed addresses
2. Update `subgraph/subgraph.yaml` with addresses + startBlock
3. Verify all contracts on BscScan
4. Rebuild and deploy frontend
5. Deploy subgraph to The Graph

---

## 15. Contract Addresses

### Mainnet (Chain ID: 56)

| Contract | Address |
|---|---|
| USDT (BEP-20) | `0x55d398326f99059fF775485246999027B3197955` |
| OSLOToken | *To be updated after deployment* |
| OSLODEX | *To be updated after deployment* |
| OSLOTreasury | *To be updated after deployment* |
| OSLOLiquidityManager | *To be updated after deployment* |
| OSLODAO | *To be updated after deployment* |
| OSLORankSystem | *To be updated after deployment* |
| OSLOReferral | *To be updated after deployment* |
| OSLOInvestmentEngine | *To be updated after deployment* |

---

## 16. Key User Flows (Summary)

### Registration
`User → $1 USDT → Referral → injectUSDTLiquidity() → DEX reserves ↑`

### Deposit
`User → USDT → InvestmentEngine → OSLODEX (liquidity) → OSLO back to IE reserve`

### Claim Yield
`User → claimRewards() → USDT yield calculated → OSLO at DEX rate → User wallet`

### Sell OSLO
`User → OSLO → Token burns 10% → DEX receives 90% → 20% burned + 70% to IE + 10% LP → USDT to user`

### Referral Commission
`Downline claims → distributeReferralCommission() → walks 20 levels → accumulates USDT → upline claims`

### Rank Bonus
`Deposits record turnover → week completes → user claims → 40/60 checked → bonus in USDT`

### DAO Royalty
`Team reaches 250 → qualified → month completes → 0.5% of turnover / members → USDT`

---

## 17. Risk Considerations

| Risk | Mitigation |
|---|---|
| OSLO price crash | Deflationary burns reduce supply; DEX has growing USDT reserves |
| InvestmentEngine OSLO depletion | Auto-refill from 11M reserve; sell recycling returns 70% to IE |
| Registration fee injection failure | Try/catch pattern; USDT stays in Referral contract if DEX call fails |
| Combined 3X cap tracking mismatch | All income sources notify IE synchronously via trusted contracts |
| Timelock compromise | 48-hour delay allows community response; only pause/rescue available |
| Gas limits on migration | Batch of 50 users per transaction |

---

## 18. File Structure

```
OSLO-MOTO/
├── contracts/
│   ├── contracts/
│   │   ├── libraries/OSLOConstants.sol    — Protocol constants
│   │   ├── interfaces/                    — 9 interface contracts
│   │   ├── OSLOToken.sol                  — BEP-20 with sell tax
│   │   ├── OSLODEX.sol                    — Custom DEX
│   │   ├── OSLOInvestmentEngine.sol       — Core staking
│   │   ├── OSLOReferral.sol               — 20-level referral
│   │   ├── OSLORankSystem.sol             — Rank bonuses
│   │   ├── OSLODAO.sol                    — DAO royalties
│   │   ├── OSLOTreasury.sol               — Fee router
│   │   └── OSLOLiquidityManager.sol       — Protocol LP
│   ├── scripts/
│   │   ├── deploy.ts                      — Mainnet deployment
│   │   └── snapshot-testnet.ts            — Migration snapshot
│   ├── test/                              — Hardhat test suite
│   └── hardhat.config.ts
├── frontend/
│   ├── src/
│   │   ├── app/                           — Next.js pages
│   │   ├── hooks/                         — wagmi contract hooks
│   │   ├── lib/                           — config, utils, constants
│   │   ├── components/                    — UI components
│   │   └── abis/                          — Contract ABIs
│   └── next.config.js
└── subgraph/
    ├── src/                               — Event handlers
    ├── schema.graphql                     — Entity definitions
    └── subgraph.yaml                      — Manifest (BSC mainnet)
```

---

*This blueprint reflects the final mainnet-ready state of OSLO Protocol as of May 2026.*
