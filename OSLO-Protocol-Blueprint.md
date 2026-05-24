# OSLO Protocol — Smart Contract Blueprint

> **Last Updated:** May 3, 2026  
> **Test Suite:** 95/95 passing  
> **BSC Testnet Deployment (v3):** All 8 contracts deployed  

---

## 1. Overview

OSLO Protocol is a BSC-based DeFi staking and multi-level referral platform. Users deposit BUSD, earn daily yields up to 3X their deposit, and build referral teams earning commissions across 20 levels. The protocol uses a **dual-decline rate model**: rates drop both over time (5 phases from launch) and per-user (caps after each completed 3X cycle).

### Key Design Principles

| Principle | Detail |
|---|---|
| **No deposit fee** | 100% of BUSD deposited is staked |
| **Principal locked after trial** | 10-day trial; early exit costs 10% penalty |
| **10% withdrawal fee** | Applied on all profit claims → routed to liquidity |
| **3X per-deposit cap** | Each deposit stops yielding at 3X of its principal |
| **Immutable after setup** | Admin is renounced after `completeSetup()`; controlled by Timelock |
| **Permissionless distribution** | Anyone can trigger treasury/rank/DAO payouts |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OSLOConstants (Library)                      │
│   All protocol constants: rates, tiers, fees, thresholds, time   │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────────┐
        ▼           ▼           ▼           ▼               ▼
┌──────────┐ ┌────────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
│ OSLOToken│ │ Investment │ │Referral│ │RankSystem│ │LiquidityMgr  │
│ (ERC20)  │ │  Engine    │ │ (20lv) │ │ (7rank)  │ │(PancakeSwap) │
│ 11.1M    │ │ Staking    │ │        │ │          │ │              │
│ supply   │ │ Core       │ │        │ │          │ │              │
│ 10% sell │ │            │ │        │ │          │ │              │
│ tax      │ │            │ │        │ │          │ │              │
└────┬─────┘ └─────┬──────┘ └───┬────┘ └────┬─────┘ └──────┬───────┘
     │              │            │           │              │
     │              │            ▼           │              │
     │              │      ┌──────────┐      │              │
     │              │      │ OSLODAO  │      │              │
     │              │      │(200 max) │      │              │
     │              │      └────┬─────┘      │              │
     │              │           │            │              │
     │              ▼           ▼            ▼              │
     │         ┌──────────────────────────────────┐        │
     │         │          OSLOTreasury             │        │
     │         │  Fee Router (70/20/10 split)      │────────┘
     │         └──────────────────────────────────┘
     │                       │
     └───────────────────────┘ (sell tax routing)
```

### Contract Dependency Graph

```
                    ┌─────────────┐
                    │ MockBUSD    │ (testnet only — BEP-20 with mint)
                    └──────┬──────┘
                           │ used by all contracts
    ┌──────────────────────┼──────────────────────────┐
    ▼                      ▼                          ▼
┌──────────┐    ┌────────────────────┐    ┌────────────────────┐
│OSLOToken │    │OSLOInvestmentEngine│    │OSLOReferral        │
│          │◄───│  (reads token for  │───►│(distributeReferral │
│          │    │   tier checks)     │    │ Commission)        │
└────┬─────┘    └────────┬───────────┘    └─────────┬──────────┘
     │                   │                          │
     │    ┌──────────────┼──────────────┐           │
     │    ▼              ▼              ▼           │
     │ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
     │ │Treasury  │ │RankSystem│ │LiquidityMgr  │  │
     │ │(70/20/10)│ │(weekly)  │ │(PancakeSwap) │◄─┘
     │ └────┬─────┘ └────┬─────┘ └──────┬───────┘
     │      │            │              │
     │      ▼            ▼              │
     │  ┌────────┐  (bonus pool)        │
     │  │OSLODAO │                      │
     │  │(royalty│                      │
     │  │ pool)  │                      │
     │  └────────┘                      │
     │                                  │
     └──────────────────────────────────┘
```

---

## 3. Token Economics

### 3.1 OSLO Token

| Property | Value |
|---|---|
| **Symbol** | OSLO |
| **Name** | OSLO Protocol |
| **Standard** | BEP-20 (ERC20 + ERC20Burnable) |
| **Total Supply** | 11,100,000 OSLO |
| **Early Adopter Allocation** | 1,322,000 OSLO (airdrop via vault) |
| **Investor Allocation** | 9,778,000 OSLO (held by LiquidityManager for LP) |
| **Minting** | None — fixed supply, minted once at deploy |
| **Burning** | Via sell tax (10% of tax → 0xdead) and buyback-burn |

### 3.2 BUSD (Stablecoin)

| Property | Detail |
|---|---|
| **Mainnet** | Binance-Peg BUSD (`0xe9e7CEA3...`) |
| **Testnet** | MockBUSD — mintable by anyone for testing |

### 3.3 Supply Distribution

```
TOTAL_SUPPLY = 11,100,000 OSLO
├── Early Adopter Airdrop: 1,322,000 OSLO (9-tier system, first 42,650 registrants)
└── Investor ROI Pool:     9,778,000 OSLO (held by LiquidityManager, paired as LP)
```

---

## 4. Core Contracts — Detailed Breakdown

### 4.1 OSLOConstants (`libraries/OSLOConstants.sol`)

Stateless library holding all protocol constants. Every contract imports this.

**Tier Boundaries (BUSD, 18 decimals):**

| Tier | Min | Max |
|---|---|---|
| 1 | $10 | $499 |
| 2 | $500 | $2,499 |
| 3 | $2,500 | $4,999 |
| 4 | $5,000 | $9,999 |
| 5 | $10,000+ | ∞ |

**Tier-Based Daily Rates (Phase 1 only):**

| Tier | Daily Rate | Investment Rate | Profit Rate |
|---|---|---|---|
| 1 | 2.50% (250 bp) | 2.00% (200 bp) | 0.50% (50 bp) |
| 2 | 2.75% (275 bp) | 2.25% (225 bp) | 0.50% (50 bp) |
| 3 | 3.00% (300 bp) | 2.50% (250 bp) | 0.50% (50 bp) |
| 4 | 3.25% (325 bp) | 2.75% (275 bp) | 0.50% (50 bp) |
| 5 | 3.50% (350 bp) | 3.00% (300 bp) | 0.50% (50 bp) |

All tiers share the same 0.50% profit rate — referral commissions are paid only from the profit portion.

**Time-Based ROI Phases (from Launch: May 10, 2026 00:00 UTC):**

| Phase | Time Range | Daily Rate | Earning Cap |
|---|---|---|---|
| Phase 1 | 0–3 months | Tier-based (2.50%–3.50%) | 3X |
| Phase 2 | 3–6 months | 2.00% (200 bp) | 3X |
| Phase 3 | 6–9 months | 1.50% (150 bp) | 3X |
| Phase 4 | 9–12 months | 1.00% (100 bp) | 3X |
| Phase 5 | 12+ months | 0.50% (50 bp) | 3X |

**Reinvestment Cycle Rate Caps (after each 3X completion):**

| Cycles Completed | Cap (bp) |
|---|---|
| 0 (first deposit) | No cap |
| 1 | 2.00% (200 bp) |
| 2 | 1.50% (150 bp) |
| 3 | 1.00% (100 bp) |
| 4+ | 0.50% (50 bp) |

**Effective Rate = min(time_phase_rate, cycle_cap)**

**Fees & Penalties:**

| Fee | Rate |
|---|---|
| Withdrawal fee (on profit claims) | 10% (1000 bp) |
| Trial period | 10 days |
| Early exit penalty (during trial) | 10% (1000 bp) |
| Sell tax (OSLO → sell endpoint) | 10% (1000 bp) |
| Sell tax → LP | 90% of tax |
| Sell tax → Burn | 10% of tax |
| Return cap | 3X per deposit |

**Referral:**

| Parameter | Value |
|---|---|
| Max levels | 20 |
| Registration fee | $5 BUSD |
| Qualified direct min deposit | $100 BUSD |
| Level 1 commission | 30% of profit |
| Level 2 commission | 20% of profit |
| Levels 3–10 | 1.00% of profit each |
| Levels 11–15 | 0.50% of profit each |
| Levels 16–20 | 0.25% of profit each |
| Early adopter airdrop | First 42,650 registrants (9 tiers, 10K→10 OSLO) |

**Rank System:**

| Rank | Turnover Required | Weekly Bonus |
|---|---|---|
| 1 (Bronze) | $10,000 | 1.00% |
| 2 (Silver) | $25,000 | 0.50% |
| 3 (Gold) | $75,000 | 0.30% |
| 4 (Platinum) | $200,000 | 0.20% |
| 5 (Diamond) | $500,000 | 0.15% |
| 6 (Master) | $1,200,000 | 0.10% |
| 7 (Grandmaster) | $2,500,000 | 0.05% |

**Treasury Split:**

| Destination | Share |
|---|---|
| Rank System bonus pool | 70% |
| DAO royalty pool | 20% |
| Liquidity Manager | 10% |

**DAO:**

| Parameter | Value |
|---|---|
| Max members | 200 |
| Team size requirement | 250+ |
| Monthly royalty | 0.5% of protocol turnover, split equally |

**Governance:**

| Parameter | Value |
|---|---|
| Proposal threshold | 1% of total supply |
| Voting period | ~3 days (86,400 blocks) |
| Timelock delay | 48 hours |

---

### 4.2 OSLOInvestmentEngine (`contracts/OSLOInvestmentEngine.sol`)

**Purpose:** Core staking contract — deposits, daily yield accrual, 10-day trial, 3X cap, reward claims.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | BUSD stablecoin |
| `launchTimestamp` | `uint256 immutable` | Protocol launch time (May 10, 2026) |
| `treasury` | `address` | Treasury contract |
| `referral` | `address` | Referral contract |
| `rankSystem` | `address` | Rank system contract |
| `liquidityManager` | `address` | Liquidity manager contract |
| `admin` | `address` | Deployer (renounced after setup) |
| `timelock` | `address` | DAO Timelock for emergency pause |
| `setupComplete` | `bool` | Immutable after setup |
| `depositsPaused` | `bool` | Emergency pause for new deposits |
| `userDeposits[user][]` | `Deposit[]` | Per-user deposit array |
| `users[user]` | `UserInfo` | Per-user aggregate stats |
| `completedCycles[user]` | `uint256` | Number of completed 3X cycles |
| `totalDeposited` | `uint256` | Global BUSD deposited |
| `totalWithdrawn` | `uint256` | Global BUSD withdrawn |
| `totalRewardsPaid` | `uint256` | Global rewards paid |

**Structs:**

```solidity
struct Deposit {
    uint256 amount;          // Full deposit amount (no fee deducted)
    uint256 tier;            // Tier 1-5
    uint256 depositTime;     // Block timestamp
    uint256 lastClaimTime;   // Last claim timestamp
    uint256 totalClaimed;    // Cumulative rewards claimed
    bool active;             // Still yielding (false if capped/exited)
}

struct UserInfo {
    uint256 totalActiveDeposit;
    uint256 depositCount;
}
```

**External Functions:**

| Function | Access | Description |
|---|---|---|
| `configure(...)` | `onlyAdmin` | Wire up treasury, referral, rank, LP, timelock |
| `completeSetup()` | `onlyAdmin` | Finalize setup, renounce admin |
| `setDepositsPaused(bool)` | `onlyTimelock` | Emergency pause new deposits |
| `deposit(uint256 amount)` | Public | Deposit BUSD, create Deposit entry |
| `claimRewards(uint256 depositIndex)` | Public | Claim accrued rewards from a deposit |
| `withdrawPrincipal(uint256 depositIndex)` | Public | Early exit (trial period only) |

**View Functions:**

| Function | Returns |
|---|---|
| `getActiveDeposit(address)` | `uint256` total active BUSD |
| `getUserTier(address)` | `uint256` tier (0-5) |
| `getDepositCount(address)` | `uint256` number of deposits |
| `getPendingRewards(address, uint256)` | `(investmentReturn, profitReturn)` |
| `isInTrialPeriod(address, uint256)` | `bool` |
| `getTrialTimeRemaining(address, uint256)` | `uint256` seconds |

**Rate Calculation Chain:**

```
deposit() ──► _getTier(amount)
                  │
claimRewards() ──► _calculatePendingRewards(user, dep)
                       │
                       ├── _getEffectiveRate(user, tier)
                       │       ├── _getTimeBasedRate(tier)     ← phase check vs launchTimestamp
                       │       └── _getCycleCap(user)          ← completedCycles mapping
                       │
                       ├── invRate = effectiveRate - PROFIT_RATE (50 bp)
                       ├── profRate = min(effectiveRate, PROFIT_RATE)
                       │
                       ├── pending = (amount × rate × elapsed) / (1 day × 10000)
                       └── 3X cap check: if totalClaimed + pending ≥ amount × 3
                               → cap at remaining, deactivate, increment completedCycles
```

**Key Logic:**

1. **Deposit:** No fee — full amount transferred and staked. Tier determined by amount. Records turnover for all 20 uplines.
2. **Claim Rewards:** Calculates pending via `_calculatePendingRewards`. Applies 10% withdrawal fee → LiquidityManager. Distributes referral commission on profit portion → Referral. If 3X cap hit, deposit deactivates and `completedCycles` increments.
3. **Withdraw Principal:** Only during 10-day trial. Deducts already-claimed profits from principal. Applies 10% penalty on remainder → LiquidityManager. After trial, `PrincipalLocked` error.

**Events:** `Deposited`, `RewardsClaimed`, `PrincipalWithdrawn`, `DepositsPaused`, `CycleCompleted`

---

### 4.3 OSLOToken (`contracts/OSLOToken.sol`)

**Purpose:** Fixed-supply BEP-20 token with deflationary sell tax. No mint function exists.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `totalBurned` | `uint256` | Cumulative tokens burned via sell tax |
| `liquidityManager` | `address` | Receives LP portion of sell tax |
| `_taxWhitelist` | `mapping(address→bool)` | Addresses exempt from sell tax |
| `isSellEndpoint` | `mapping(address→bool)` | Addresses that trigger sell tax (e.g., PancakeSwap pair) |
| `admin` | `address` | Renounced after setup |
| `setupComplete` | `bool` | Immutable after setup |

**Sell Tax Mechanism:**

The `_update()` override (OZ v5 hook) intercepts transfers. Tax applies when:
- `from` is not zero-address (not minting)
- `to` is not zero-address (not burning)
- `from` is not whitelisted
- `to` is a designated sell endpoint
- `liquidityManager` is configured

Tax breakdown: 10% total → 90% to LiquidityManager, 10% to 0xdead (burn).

**Admin Setup Functions (pre-completeSetup):** `setSellTaxAddresses()`, `setTaxWhitelist()`, `setSellEndpoint()`, `completeSetup()`

---

### 4.4 OSLOReferral (`contracts/OSLOReferral.sol`)

**Purpose:** Decentralized 20-level referral tree with level unlocking and commission distribution. Also handles early adopter airdrop.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | For registration fees and commission claims |
| `osloToken` | `IERC20 immutable` | For early adopter airdrops |
| `investmentEngine` | `address` | To check qualified directs |
| `earlyAdopterVault` | `address` | Holds 1.32M OSLO for airdrops |
| `treasury` | `address` | Receives $5 registration fees |
| `userInfo[user]` | `UserReferralInfo` | Per-user referral data |
| `referralRewards[user]` | `uint256` | Pull-based commission balance |
| `totalRegistered` | `uint256` | Global registration counter |
| `totalCommissionsPaid` | `uint256` | Cumulative commissions |

**Struct:**

```solidity
struct UserReferralInfo {
    address referrer;
    address[] directReferrals;
    uint256 unlockedLevels;     // 0-20
    uint256 totalEarned;
    bool registered;
}
```

**Registration Flow:**
1. User calls `register(user, referrer)` — or frontend calls on user's behalf
2. $5 BUSD transferred from user → Treasury via `safeTransferFrom`
3. User added to referrer's `directReferrals` array
4. If `totalRegistered ≤ 42,650`: early adopter airdrop (OSLO from vault)
5. Emits `UserRegistered`

**Level Unlocking:**

| Qualified Directs (≥$100 active) | Max Level Unlocked |
|---|---|
| 1 | 3 |
| 2 | 8 |
| 3 | 12 |
| 5 | 16 |
| 7 | 20 |

Called automatically by `checkAndUnlockLevels()` — triggered after deposits/withdrawals.

**Commission Distribution:**
- Called by InvestmentEngine on each claim via `distributeReferralCommission(user, profitAmount)`
- Walks up 20 levels of uplines
- Only pays uplines with sufficient `unlockedLevels`
- Commissions accumulate in `referralRewards[upline]` (pull-based)
- Users call `claimReferralRewards()` to withdraw

**Airdrop Tiers:**

| Registration # | OSLO |
|---|---|
| 1–2 | 10,000 |
| 3–12 | 5,000 |
| 13–32 | 2,500 |
| 33–50 | 1,500 |
| 51–150 | 1,000 |
| 151–1,150 | 250 |
| 1,151–7,650 | 50 |
| 7,651–22,650 | 20 |
| 22,651–42,650 | 10 |

---

### 4.5 OSLORankSystem (`contracts/OSLORankSystem.sol`)

**Purpose:** Calculates weekly team turnover and distributes progressive rank bonuses.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | For bonus payouts |
| `investmentEngine` | `address` | Authorized caller for `recordTurnover` |
| `weeklyTurnoverData[user][weekId]` | `mapping→uint256` | Accumulated turnover per week |
| `weekBonusClaimed[user][weekId]` | `mapping→bool` | Claim tracking |
| `bonusPoolBalance` | `uint256` | Available bonus pool |
| `genesisTimestamp` | `uint256 immutable` | Monday 00:00 UTC epoch start |

**Week Calculation:**
```solidity
weekId = (block.timestamp - genesisTimestamp) / 7 days + 1
```

**Turnover Recording:**
- Called by InvestmentEngine on every deposit
- Records the deposit amount as turnover for all 20 uplines of the depositor
- Each upline's weekly turnover accumulates independently

**Rank Bonus Claim:**
1. User calls `claimRankBonus()` for the previous completed week
2. Rank determined from that week's accumulated turnover
3. Bonus = `turnover × rank_bonus_bp / 10000`
4. Paid from bonus pool (funded by Treasury at 70% of fee distributions)

**Ranks (Progressive — highest achieved):**

| Rank | Turnover | Bonus % |
|---|---|---|
| 1 (Bronze) | $10,000 | 1.00% |
| 2 (Silver) | $25,000 | 0.50% |
| 3 (Gold) | $75,000 | 0.30% |
| 4 (Platinum) | $200,000 | 0.20% |
| 5 (Diamond) | $500,000 | 0.15% |
| 6 (Master) | $1,200,000 | 0.10% |
| 7 (Grandmaster) | $2,500,000 | 0.05% |

---

### 4.6 OSLODAO (`contracts/OSLODAO.sol`)

**Purpose:** DAO entry qualification, monthly royalty distribution. First 200 users with 250+ team members qualify permanently.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | For royalty payouts |
| `daoMembers` | `address[]` | Ordered list of qualified members |
| `isDAOMember[user]` | `mapping→bool` | Membership check |
| `monthlyTurnover[monthId]` | `mapping→uint256` | Protocol turnover per month |
| `royaltyClaimed[user][monthId]` | `mapping→bool` | Claim tracking |
| `royaltyPoolBalance` | `uint256` | Available royalty pool |
| `genesisTimestamp` | `uint256 immutable` | Contract deploy time |

**Month Calculation:**
```solidity
monthId = (block.timestamp - genesisTimestamp) / 30 days + 1
```

**DAO Qualification:**
- `checkAndQualify(user, teamSize)` — called externally (e.g., by Referral)
- Requirements: `<200 members`, `teamSize ≥ 250`, not already a member
- Once qualified, membership is **permanent**

**Monthly Royalty Claim:**
1. DAO member calls `claimRoyalty()` for previous month
2. Total royalty pool = `monthlyTurnover × 0.5% (50 bp)`
3. Each member gets equal share = `totalRoyalty / memberCount`
4. Paid from royalty pool (funded by Treasury at 20% of fee distributions)

---

### 4.7 OSLOTreasury (`contracts/OSLOTreasury.sol`)

**Purpose:** Autonomous fee router. No EOA can withdraw funds. Receives fees and distributes to Rank/DAO/LP pools.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | Fee token |
| `osloToken` | `IERC20 immutable` | Protected from rescue |
| `rankSystem` | `address` | Rank bonus pool destination |
| `dao` | `address` | DAO royalty pool destination |
| `liquidityManager` | `address` | LP destination |
| `totalReceived` | `uint256` | Cumulative fees received |
| `pendingDistribution` | `uint256` | Unallocated fees awaiting distribution |

**Distribution Split (permissionless — anyone can call `distribute()`):**

| Destination | Share |
|---|---|
| RankSystem (`receiveBonusPool`) | 70% |
| DAO (`receiveRoyaltyPool`) | 20% |
| LiquidityManager (`addLiquidityFromFees`) | 10% |

**Security:**
- `rescueERC20()` only callable by Timelock
- BUSD and OSLO explicitly blocked from rescue (no rug pulls)
- Admin renounced after `completeSetup()`

---

### 4.8 OSLOLiquidityManager (`contracts/OSLOLiquidityManager.sol`)

**Purpose:** Automated liquidity provision and OSLO buyback/burn via PancakeSwap V2.

**State Variables:**

| Variable | Type | Description |
|---|---|---|
| `busd` | `IERC20 immutable` | Stablecoin |
| `osloToken` | `IERC20 immutable` | Protocol token |
| `router` | `IPancakeRouter02 immutable` | PancakeSwap V2 router |
| `totalLiquidityAdded` | `uint256` | Cumulative LP tokens minted |
| `totalBurnedViaSwap` | `uint256` | Cumulative OSLO burned via buyback |

**Functions:**

| Function | Description |
|---|---|
| `addInitialLiquidity(busdAmount)` | Admin-only: seed initial LP pool using LM's own OSLO |
| `addLiquidityFromFees(busdAmount)` | Swaps 50% BUSD→OSLO, adds LP with both halves. LP tokens → 0xdead |
| `buybackAndBurn(busdAmount)` | Swaps all BUSD→OSLO, sends OSLO to 0xdead |
| `rescueERC20(token, amount)` | Timelock-only: rescue non-protocol tokens |

**LP Token Handling:**
All LP tokens from `addLiquidity()` are sent to `DEAD_ADDRESS` (`0x...dEaD`) — permanently locked, cannot be withdrawn.

---

## 5. User Flows

### 5.1 Registration & First Deposit

```
User                    Referral              InvestmentEngine       Treasury
 │                         │                       │                    │
 │── register(user,ref)───►│                       │                    │
 │                         │── safeTransferFrom ──────────────────────►│ ($5 fee)
 │                         │   ($5 from user)     │                    │
 │                         │── airdrop OSLO ──► user (if ≤42,650)     │
 │                         │◄─────────────────────│                    │
 │                         │                       │                    │
 │── approve(BUSD) ──────────────────────────────►│                    │
 │── deposit($100) ──────────────────────────────►│                    │
 │                         │                       │── safeTransferFrom │
 │                         │                       │   ($100 from user) │
 │                         │                       │── create Deposit   │
 │                         │◄── checkAndUnlock ────│                    │
 │                         │◄── recordTurnover ────│ (for all uplines)  │
 │◄── Deposited event ─────────────────────────────│                    │
```

### 5.2 Claim Rewards

```
User                    InvestmentEngine       LiquidityMgr          Referral
 │                         │                       │                    │
 │── claimRewards(0) ─────►│                       │                    │
 │                         │── calculate pending   │                    │
 │                         │   (rate × time × amt) │                    │
 │                         │── 10% fee ───────────►│ addLiquidityFromFees
 │                         │── 90% net ──────► user │                    │
 │                         │── commission(profit) ─────────────────────►│
 │                         │                       │                    │── credit uplines
 │◄── RewardsClaimed ──────│                       │                    │
```

### 5.3 Early Exit (During 10-Day Trial)

```
User                    InvestmentEngine       LiquidityMgr
 │                         │                       │
 │── withdrawPrincipal(0)─►│                       │
 │                         │── check trial period  │
 │                         │── deduct already-claimed from principal
 │                         │── 10% penalty ───────►│ addLiquidityFromFees
 │                         │── 90% remainder ──► user
 │◄── PrincipalWithdrawn ───│                       │
```

### 5.4 After Trial (Principal Locked)

```
User                    InvestmentEngine
 │                         │
 │── withdrawPrincipal(0)─►│
 │◄── PrincipalLocked error │  (block.timestamp ≥ depositTime + 10 days)
 │                         │
 │── claimRewards(0) ─────►│  (still works — only profit withdrawal)
 │◄── RewardsClaimed ──────│
```

### 5.5 3X Cap Hit

```
User                    InvestmentEngine
 │                         │
 │── claimRewards(0) ─────►│
 │                         │── totalClaimed + pending ≥ amount × 3
 │                         │── cap at remaining
 │                         │── dep.active = false
 │                         │── completedCycles[user]++
 │                         │── emit CycleCompleted(user, cycles)
 │◄── RewardsClaimed ──────│
 │                         │
 │── deposit($500) ───────►│ (new deposit starts with capped rate)
 │   rate = min(phase_rate, cycle_cap)
```

---

## 6. Fee Flow Summary

```
                           ┌─────────────────────┐
                           │   User Deposits BUSD │
                           └──────────┬──────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │  $5 Registration │   Deposit Amt   │
                    │  Fee (once)      │   (100% staked) │
                    ▼                  │                  │
              ┌──────────┐            │                  │
              │ Treasury │            │                  │
              └────┬─────┘            │                  │
                   │                  │                  │
      ┌────────────┼──────────┐       │                  │
      ▼            ▼          ▼       │                  │
┌──────────┐ ┌──────────┐ ┌──────┐   │                  │
│RankSystem│ │  OSLODAO │ │  LP  │   │                  │
│  (70%)   │ │  (20%)   │ │ (10%)│   │                  │
└──────────┘ └──────────┘ └──────┘   │                  │
                                      │                  │
         ┌────────────────────────────┘                  │
         │                                               │
         ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│  Claim Rewards  │                            │  Early Exit     │
│  10% fee → LP   │                            │  10% penalty→LP │
│  Commission on  │                            │  (trial only)   │
│  profit → Ref   │                            └─────────────────┘
└─────────────────┘

Sell Tax (OSLO transfers to PancakeSwap):
  10% of transfer → 90% to LiquidityManager, 10% burned (0xdead)
```

---

## 7. Governance & Security Model

### 7.1 Setup Lifecycle

```
1. CONSTRUCTOR ──► admin = deployer
2. configure() ──► wire up all inter-contract addresses
3. completeSetup() ──► setupComplete = true, admin = 0x0
                        (irreversible — no more admin changes)
4. Timelock ──► controls emergency pause (depositsPaused)
                and rescueERC20 on Treasury + LiquidityManager
```

### 7.2 Access Control Matrix

| Action | Access |
|---|---|
| `configure()` on any contract | `onlyAdmin` (pre-setup) |
| `completeSetup()` on any contract | `onlyAdmin` (pre-setup, irreversible) |
| `setDepositsPaused()` | `onlyTimelock` |
| `rescueERC20()` (Treasury, LM) | `onlyTimelock` |
| `receiveFees()` (Treasury) | Any address (but requires BUSD approval) |
| `distribute()` (Treasury) | **Permissionless** — anyone can call |
| `claimRankBonus()` | **Permissionless** — any registered user |
| `claimRoyalty()` | `onlyDAOMember` |
| `deposit()`, `claimRewards()`, `withdrawPrincipal()` | **Permissionless** — any registered user |
| All view functions | **Permissionless** |

### 7.3 Security Properties

| Property | Mechanism |
|---|---|
| **No admin rug pull** | Admin renounced after `completeSetup()`. No `onlyAdmin` functions after setup. |
| **No treasury rug pull** | `rescueERC20` blocks BUSD + OSLO. Only Timelock can rescue non-protocol tokens. |
| **No LP withdrawal** | All LP tokens sent to `0xdead` — permanently locked. |
| **No minting** | OSLO token has no `mint()` function. Fixed supply at deploy. |
| **Reentrancy protection** | All state-changing public functions use `nonReentrant` from OZ v5. |
| **Emergency pause** | Timelock can pause new deposits without affecting claims/withdrawals. |
| **Principal immutability** | After 10-day trial, principal cannot be withdrawn — only profit claims. |

---

## 8. Interfaces

### IInvestmentEngine
```solidity
function getActiveDeposit(address user) external view returns (uint256);
function getUserTier(address user) external view returns (uint256);
```

### IReferral
```solidity
function register(address user, address referrer) external;
function isRegistered(address user) external view returns (bool);
function getReferrer(address user) external view returns (address);
function getDirectReferrals(address user) external view returns (address[] memory);
function getQualifiedDirectsCount(address user) external view returns (uint256);
function getUnlockedLevels(address user) external view returns (uint256);
function distributeReferralCommission(address user, uint256 profitAmount) external;
function checkAndUnlockLevels(address user) external;
function getTeamSize(address user) external view returns (uint256);
function claimReferralRewards() external;
```

### IRankSystem
```solidity
function recordTurnover(address user, uint256 amount) external;
function claimRankBonus() external;
function getCurrentRank(address user) external view returns (uint256);
function getWeeklyTurnover(address user, uint256 weekId) external view returns (uint256);
function getCurrentWeekId() external view returns (uint256);
function receiveBonusPool(uint256 amount) external;
```

### ITreasury
```solidity
function receiveFees(uint256 amount) external;
function distribute() external;
function totalReceived() external view returns (uint256);
```

### IDAO
```solidity
function checkAndQualify(address user, uint256 teamSize) external;
function isDAOMember(address user) external view returns (bool);
function daoMemberCount() external view returns (uint256);
function claimRoyalty() external;
function receiveRoyaltyPool(uint256 amount) external;
function recordMonthlyTurnover(uint256 amount) external;
```

### ILiquidityManager
```solidity
function addLiquidityFromFees(uint256 busdAmount) external;
function buybackAndBurn(uint256 busdAmount) external;
```

### IOSLOToken
```solidity
function totalBurned() external view returns (uint256);
function setSellTaxAddresses(address liquidityManager) external;
function setTaxWhitelist(address account, bool whitelisted) external;
function isTaxWhitelisted(address account) external view returns (bool);
```

---

## 9. BSC Testnet Deployment (v3)

**Chain:** BSC Testnet (chainId: 97)  
**Deployer:** `0x47f8160e3C854b4b4679579b99726E5E81736B7f`  
**Date:** May 3, 2026  

| Contract | Address |
|---|---|
| OSLO Token | `0xA3ea5816663B8f9515aCF4E41a826cea2A697ddE` |
| Investment Engine | `0x19b07B7Ca33390a278323e7bB5ad4f7a32777BFa` |
| Referral | `0xEdD70c05A38B7981a241784D7b26D5df4F8d190d` |
| Rank System | `0x903D32E695DbF8e9F4814A2afF34C9e65bb82341` |
| DAO | `0xC85CB52f369eBF14Ec219249B56AC7928762650e` |
| Treasury | `0x1fC53A9c09C16c0902482EeE46ADE64e7629789b` |
| Liquidity Manager | `0x6A27B374CEB5D1Ead13aDBbfEf9aAA0CD94178fd` |
| Mock BUSD | `0x1840Bf276C684732bfCbDc691787E364f8871cFf` |
| PancakeSwap Router (testnet) | `0xD99D1c33F9fC3444f8101754aBC46c52416550D1` |

---

## 10. Contract Source Files

| File | Lines | Purpose |
|---|---|---|
| `contracts/libraries/OSLOConstants.sol` | 130 | All protocol constants |
| `contracts/OSLOInvestmentEngine.sol` | 412 | Core staking engine |
| `contracts/OSLOToken.sol` | 129 | BEP-20 token with sell tax |
| `contracts/OSLOReferral.sol` | 291 | 20-level referral + airdrop |
| `contracts/OSLORankSystem.sol` | 190 | 7-rank weekly bonus system |
| `contracts/OSLODAO.sol` | 179 | DAO membership + monthly royalties |
| `contracts/OSLOTreasury.sol` | 136 | Autonomous fee router |
| `contracts/OSLOLiquidityManager.sol` | 166 | PancakeSwap LP + buyback/burn |
| `contracts/interfaces/IInvestmentEngine.sol` | 8 | |
| `contracts/interfaces/IReferral.sol` | 16 | |
| `contracts/interfaces/IRankSystem.sol` | 12 | |
| `contracts/interfaces/ITreasury.sol` | 9 | |
| `contracts/interfaces/IDAO.sol` | 12 | |
| `contracts/interfaces/ILiquidityManager.sol` | 8 | |
| `contracts/interfaces/IOSLOToken.sol` | 10 | |
| `contracts/interfaces/IPancakeRouter.sol` | 34 | |

---

## 11. Test Coverage Summary

| Test File | Tests | Status |
|---|---|---|
| `FeeModel.test.ts` | 14 | ✅ All passing |
| `OSLOInvestmentEngine.test.ts` | 22 | ✅ All passing |
| `Integration.test.ts` | 7 | ✅ All passing |
| `OSLOReferral.test.ts` | 11 | ✅ All passing |
| `OSLODAO.test.ts` | 16 | ✅ All passing |
| `OSLORankSystem.test.ts` | 8 | ✅ All passing |
| `OSLOToken.test.ts` | 11 | ✅ All passing |
| `OSLOTreasury.test.ts` | 6 | ✅ All passing |
| **Total** | **95** | **✅ All passing** |

---

## 12. Frontend Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Blockchain | wagmi v2 + viem |
| Styling | Tailwind CSS + Framer Motion |
| Contract ABIs | Extracted from Hardhat artifacts (`artifact.abi`) |
| Constants | `src/lib/constants.ts` — mirrors OSLOConstants.sol |
| Contract Addrs | `src/lib/contracts.ts` |

**Frontend Pages:** `/invest`, `/referrals`, `/ranks`, `/dao`, `/treasury`  
**Hooks:** `useInvestmentEngine`, `useToken`, `useReferral`, `useRankSystem`, `useDAO`, `useTreasury`, `useLiquidityManager`
