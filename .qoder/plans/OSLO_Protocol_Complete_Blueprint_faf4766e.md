# OSLO Protocol V3 — Complete System Blueprint

## I. System Overview

```
                                 +-------------------+
                                 |   OSLOToken       |
                                 | 11.1M fixed supply |
                                 | 30% sell burn     |
                                 | 70%→IE 0%→LP     |
                                 +--------+----------+
                                          |
         +-------------------+------------+-------------+-------------------+
         |                   |                          |                   |
+--------v--------+  +------v-------+  +---------------v--+  +------------v--+
| OSLODEX         |  | OSLOLiquidity|  | OSLOInvestment   |  | OSLOTreasury   |
| Custom DEX      |  | Manager      |  | Engine           |  | Fee Router     |
| USDT/OSLO swaps |  | LP Routing   |  | Staking + Yields |  | 100% → LP     |
| Const-product   |  +------+-------+  | + 3X Cap        |  +-------+-------+
+-------+---------+         |          +--------+---------+          |
        |                   |                   |                    |
        |                   |     +-------------+------+             |
        |                   |     |                    |             |
        |                   | +---v------+   +--------v----+        |
        |                   | | OSLO     |   | OSLORank     |        |
        |                   | | Referral |   | System       |        |
        |                   | | 20-level |   | 7 ranks      |        |
        |                   | +----+-----+   +-------+------+        |
        |                   |      |                   |             |
        |                   |      |     +--------+    |             |
        |                   |      +---->| OSLODAO|<---+             |
        |                   |            | 200 cap|                 |
        |                   |            +--------+                 |
        |                   |                                       |
        +-------------------+---------------------------------------+
                            |
                    Protocol-controlled DEX
                    USDT stays as liquidity
                    0 OSLO received from sells
```

**Platform**: BNB Smart Chain Testnet (chainId: 97, "chapel")
**Spec**: 100% Decentralized — zero admin keys, immutable parameters, permissionless distribution
**Deployed Addresses**:

| Contract             | Address                                      |
|----------------------|----------------------------------------------|
| MockUSDT             | `0xdFAff6C92d9d4e0935cAF3429e80C821A044161c` |
| OSLOToken            | `0x203D33abBf8cbb3ce4A8f61Cf13e10394A0bE65C` |
| OSLODEX              | `0x109944D383b476bc7257F68e137D4011E534A34f` |
| OSLOTreasury         | `0x6d4e694fa067A63A17c4187f795f9ED7D1f76810` |
| OSLOLiquidityManager | `0x80e990fe6C9313c0a4Dbc82Ed28bC88bDf75a279` |
| OSLODAO              | `0xD654c35fAaA33217e55b86c6C1bD4FCCc0B1F05f` |
| OSLORankSystem       | `0x7f063C8DA2AA9C44fDB92D0346031f873C891811` |
| OSLOReferral         | `0x57e7317f6ff98881fdc54604bf64DA274478B157` |
| OSLOInvestmentEngine | `0xe54a5E4811eA5014FAF5304e5A12D309A0135F2F` |

---

## II. Core Tokenomics

### Token Supply
| Property            | Value                    |
|---------------------|--------------------------|
| Name / Symbol       | OSLO Protocol / OSLO     |
| Total Supply        | 11,100,000 OSLO          |
| Decimals            | 18                       |
| Standard            | ERC20 + ERC20Burnable (OZ v5) |
| Minting             | None — genesis only, immutable |

### Supply Allocation
| Allocation            | Amount          | Recipient            | Purpose                                   |
|-----------------------|-----------------|----------------------|-------------------------------------------|
| Contract Reserve      | 11,000,000 OSLO | InvestmentEngine     | Pays investor rewards in OSLO              |
| DEX Seed Liquidity    | 100,000 OSLO    | OSLODEX (via LM)     | Initial USDT/OSLO pair liquidity          |

### Hyper-Deflationary Sell Tax (V3)
Applied on every OSLO→USDT swap via OSLODEX. The tax is **paid in tokens** — USDT stays in the DEX as liquidity. DEX receives **zero OSLO** from sells.

```
| Portion              | %      | Destination         | Mechanism                              |
|----------------------|--------|---------------------|----------------------------------------|
| Fee Burn             | 10%    | 0xdead              | Token fee burned                       |
| Contract Reserve     | 70%    | InvestmentEngine    | Replenishes OSLO reserve for rewards   |
| Deflationary Burn    | 20%    | 0xdead              | Additional supply reduction            |
| **Total Burn**       | **30%**| —                   | Per sell transaction                   |
| To DEX               | 0%     | —                   | DEX receives no OSLO                   |
```

### Burn Cap
- **Max burn**: 9,990,000 OSLO (90% of total supply)
- **Min remaining supply**: 1,110,000 OSLO (10%)
- When burn cap is reached, excess redirected to InvestmentEngine
- Total burned tracked in `OSLOToken.totalBurned`

### Tax Trigger Conditions
Tax applies ONLY when ALL conditions are met:
1. `from` is not zero-address (not minting)
2. `to` is not zero-address (not burning)
3. Sender is NOT tax-whitelisted (protocol contracts)
4. Receiver IS a sell endpoint (OSLODEX)

---

## III. Contract-by-Contract Blueprint

### Contract A — OSLOToken (`OSLOToken.sol`, 181 lines)

**Purpose**: Native BEP-20 utility token with hyper-deflationary sell tax and burn cap.

**State**:
- `totalBurned` — cumulative tokens burned
- `liquidityManager` — OSLOLiquidityManager address (for setup reference)
- `investmentEngine` — OSLOInvestmentEngine address (receives 70% of sells)
- `_taxWhitelist` — addresses exempt from sell tax
- `isSellEndpoint` — addresses that trigger sell tax (OSLODEX)
- `admin` / `timelock` — governance lifecycle
- `setupComplete` — immutable after finalization

**Tax Routing (`_update` override)**:
```
When user sells OSLO via OSLODEX:
  1. 10% → burned directly (feeToBurn)
  2. 70% → transferred to InvestmentEngine (toContract)
  3. 20% → additional burn (toBurn), subject to burn cap
  4. Net to DEX = 0 (all tokens routed or burned)
  5. Excess over burn cap → redirected to InvestmentEngine
```

**Admin Lifecycle**:
1. `setSellTaxAddresses(lpMgr, ie)` — configure routing targets
2. `setTaxWhitelist(addr, true)` — exempt protocol contracts
3. `setSellEndpoint(osloDEX, true)` — mark DEX as sell trigger
4. `setTimelock(addr)` — set governance transition address
5. `completeSetup()` — renounce admin, make immutable

**Tax-Whitelisted Addresses**: Treasury, LiquidityManager, InvestmentEngine, Referral

---

### Contract B — OSLODEX (`OSLODEX.sol`, 318 lines)

**Purpose**: Custom protocol-controlled DEX for USDT/OSLO trading. No PancakeSwap dependency.

**Core Mechanic — Constant-Product Pricing**:
```
Buy (USDT → OSLO):  osloAmount = usdtAmount × osloReserve / (usdtReserve + usdtAmount)
Sell (OSLO → USDT): usdtAmount = osloAmount × usdtReserve / (osloReserve + osloAmount)
```

**State**:
- `usdtReserve` / `osloReserve` — DEX liquidity reserves
- `totalVolumeUSDT` / `totalSwaps` — statistics
- `lastPrice` — most recent trade price (USDT per OSLO, 18 decimals)

**Key Functions**:

| Function | Access | Flow |
|----------|--------|------|
| `addInitialLiquidity(usdt, oslo)` | LiquidityManager only | Initial LP seeding during deployment |
| `addLiquidityFromFees(usdt)` | LiquidityManager only | USDT-only LP addition from fees |
| `processDeposit(usdt)` | InvestmentEngine only | Invest: receive USDT, send OSLO to IE from reserves |
| `processWithdrawal(oslo, recipient)` | InvestmentEngine only | Withdraw: receive OSLO, send USDT to user from reserves |
| `swapUSDTForOSLO(usdt, minOslo)` | Public | Buy OSLO with USDT (no tax) |
| `swapOSLOForUSDT(oslo, minUSDT)` | Public | Sell OSLO for USDT (30% burn tax applied by OSLOToken) |

**Critical Detail — Sell Swap**: When a user sells OSLO via `swapOSLOForUSDT`, the DEX uses the **declared** `osloAmount` for price calculation (fair pricing) but only receives the **actual** transferred amount (0, due to tax routing in OSLOToken). The `osloReserve` is incremented by `osloReceived` (0), keeping the reserve accounting correct.

**Price**: `usdtReserve × 1e18 / osloReserve`

---

### Contract C — OSLOInvestmentEngine (`OSLOInvestmentEngine.sol`, 558 lines)

**Purpose**: Core staking engine — USDT deposits, daily OSLO yield, 3X combined cap, early exit.

#### State Model

```solidity
struct Deposit {
    uint256 amount;          // USDT principal (no fee deducted)
    uint256 tier;            // 1–4
    uint256 dailyRate;       // Effective daily rate in bp (cached at deposit)
    uint256 depositTime;     // Block timestamp
    uint256 lastClaimTime;   // Last claim timestamp
    uint256 totalClaimed;    // Total USDT-equivalent rewards claimed
    uint256 maxReturn;       // 3X of principal (precomputed cap)
    bool active;             // Still yielding?
}

struct UserInfo {
    uint256 totalActiveDeposit;     // Sum of active principals (USDT)
    uint256 depositCount;           // Number of deposits
    uint256 totalCombinedEarnings;  // Yield + referral + rank + royalty (USDT-equivalent, 3X cap)
}
```

#### 4 Investment Tiers (Ranged Daily Rates)

| Tier | Deposit Range    | Daily Rate Range | Linear Interpolation |
|------|------------------|------------------|----------------------|
| 1    | $10 – $499       | 0.50% – 1.00%    | Within tier range    |
| 2    | $500 – $2,499    | 0.75% – 1.15%    | Within tier range    |
| 3    | $2,500 – $4,999  | 1.00% – 1.50%    | Within tier range    |
| 4    | $5,000 – $50,000 | 1.00% – 1.75%    | Capped at $50K       |

**Rate Interpolation Formula**:
```
rate = minRate + (amount - minAmt) × (maxRate - minRate) / (maxAmt - minAmt)
```

**Lifetime Rate**: After 3 months from launch (Aug 8, 2026), ALL stakes earn a flat **0.45% daily** regardless of tier.

#### Core Functions

| Function | Flow |
|----------|------|
| `deposit(amount)` | `safeTransferFrom` USDT → approve DEX → `processDeposit` (USDT to DEX, OSLO to IE reserve) → create Deposit → `checkAndUnlockLevels` → `_recordTurnoverForUplines` (×20 levels) |
| `claimRewards(index)` | Calculate pending (dailyRate × time / 1day) → check 3X cap → apply 10% withdrawal fee → convert net to OSLO at DEX price → transfer OSLO → distribute 5% profit for referral commissions |
| `earlyExit(index)` | **10-day window only** → deduct accrued yield + 10% exit fee → return net in USDT directly (not tokens) |

#### 3X Combined Cap
- **Per-deposit cap**: `totalClaimed ≤ 3 × principal`
- **Combined cap**: `totalCombinedEarnings` tracks yield + level income + rank bonuses + royalties
- When cap reached, `dep.active = false`, reverts on further claims
- Cross-contract notifications: `notifyLevelIncome()` (from Referral), `notifyRankBonus()` (from RankSystem)

#### Yield Formula
```
pending = (depositAmount × effectiveRate × timeElapsed) / (86400 × 10000)
```

#### Referral Commission on Claims
- 5% of `pendingUSDT` is the profit portion
- `distributeReferralCommission(user, profitPortion)` traverses 20 uplines
- Commissions accrue in `referralRewards[upline]` (pull-based)

#### Turnover Recording
- On every deposit: traverses 20-level referral chain
- Calls `IRankSystem.recordTurnover(upline, leg, amount)` for each upline
- Used for weekly rank qualification

---

### Contract D — OSLOReferral (`OSLOReferral.sol`, 302 lines)

**Purpose**: 20-level decentralized referral tree, level unlocking by qualified directs, USDT commission distribution.

#### State Model
```solidity
struct UserReferralInfo {
    address referrer;
    address[] directReferrals;
    uint256 unlockedLevels;    // 0–20
    uint256 totalEarned;       // Lifetime USDT-equivalent
    bool registered;
}
```

#### Registration
- **$1 USDT fee** → swapped for OSLO on DEX → OSLO permanently burned
- Fee USDT goes to DEX as liquidity via `swapUSDTForOSLO`
- Root user: `referrer = address(0)`
- Self-referral blocked
- Referrer must already be registered

#### Level Unlock System

| Levels Unlocked | Qualified Directs Required | Cumulative |
|-----------------|---------------------------|------------|
| 1–3             | 1                         | 1          |
| 4–8             | 1 more                    | 2          |
| 9–12            | 1 more                    | 3          |
| 13–16           | 2 more                    | 5          |
| 17–20           | 2 more                    | 7          |

**Qualified Direct**: A direct referral with ≥ $100 USDT active deposit. Checked via `IInvestmentEngine.getActiveDeposit()`.

#### 20-Level Commission Rates (on profit portion)

| Levels      | Rate  |
|-------------|-------|
| L1          | 30%   |
| L2          | 20%   |
| L3 – L10    | 1.00% |
| L11 – L15   | 0.50% |
| L16 – L20   | 0.25% |

- Commissions accrue in `referralRewards[user]` (USDT-denominated, pull-based)
- `claimReferralRewards()` — transfers USDT to user
- Each commission triggers `IInvestmentEngine.notifyLevelIncome()` for 3X cap tracking
- Per-level income tracked in `levelIncome[user][level]`

---

### Contract E — OSLORankSystem (`OSLORankSystem.sol`, 231 lines)

**Purpose**: Weekly team turnover tracking, 7 progressive ranks with 40/60 leg ratio qualification, USDT bonuses.

#### 7 Progressive Ranks

| Rank | Name        | Weekly Turnover  | Bonus % |
|------|-------------|------------------|---------|
| 1    | Bronze      | $10,000          | 1.00%   |
| 2    | Silver      | $25,000          | 0.50%   |
| 3    | Gold        | $75,000          | 0.30%   |
| 4    | Platinum    | $200,000         | 0.20%   |
| 5    | Diamond     | $500,000         | 0.15%   |
| 6    | Master      | $1,200,000       | 0.10%   |
| 7    | Grandmaster | $2,500,000       | 0.05%   |

**Progressive** (not cumulative): Only the highest achieved rank pays out.

#### Key Mechanics
- **Turnover** = sum of all downline deposits within Mon–Sun UTC week
- **Genesis epoch**: 2024-01-01 (Monday), 7-day periods
- **Per-leg tracking**: `legTurnover[user][weekId][legAddress]` for ratio checks
- **40/60 Leg Ratio**: Main leg ≤ 40% of total, other legs combined ≥ 60% — must satisfy to claim
- **Bonus pool**: Funded via `receiveBonusPool()` from Treasury
- **Claim**: `claimRankBonus()` for the most recent **completed** week only (current week not claimable)
- Each week can only be claimed once per user

#### Cross-Contract
- `recordTurnover()` called by InvestmentEngine during deposits (×20 uplines)
- `receiveBonusPool()` called by Treasury during distribution
- On bonus claim: notifies InvestmentEngine via `notifyRankBonus()` for 3X cap

---

### Contract F — OSLODAO (`OSLODAO.sol`, 190 lines)

**Purpose**: Elite tier — first 200 members with 250+ team size get permanent DAO membership + monthly royalties in USDT.

#### Qualification
- `DAO_TEAM_SIZE_REQUIREMENT = 250` team members (cumulative across 20 levels)
- `MAX_DAO_MEMBERS = 200` (hard cap, first-come basis)
- Membership is **permanent** once qualified
- `checkAndQualify(user, teamSize)` called externally when team size changes

#### Monthly Royalty System
- **Rate**: 0.5% of previous month's total protocol turnover
- **Split**: Equal share among all current DAO members
- **Formula**: `memberShare = (monthlyTurnover × 50bp / 10000) / daoMembers.length`
- **Claimable month**: Current month − 1 (cannot claim current month)
- Each member can claim once per past month
- **Funding**: `receiveRoyaltyPool()` receives USDT from Treasury
- Royalty claim notifies InvestmentEngine for 3X cap tracking via `notifyLevelIncome()`

#### Month ID
- `genesisTimestamp` = deployment `block.timestamp`
- Month ID = `(block.timestamp - genesisTimestamp) / 30 days + 1`

---

### Contract G — OSLOTreasury (`OSLOTreasury.sol`, 124 lines)

**Purpose**: Autonomous fee router. No EOA can withdraw. Only permissionless distribution.

#### Fee Sources
- $1 USDT registration fee from OSLOReferral (routed to DEX directly, not Treasury)
- Fee collection via `receiveFees(amount)` from InvestmentEngine (withdrawal fees)

#### Distribution (`distribute()` — permissionless)
| Destination      | %    | Mechanism                                    |
|------------------|------|----------------------------------------------|
| LiquidityManager | 100% | `safeTransfer` → `addLiquidityFromFees()`    |

Anyone can call `distribute()` — no authorization required. Funds are transferred to LiquidityManager which routes them to OSLODEX as USDT-only liquidity.

#### Security
- `rescueERC20()` only for accidentally-sent non-USDT/non-OSLO tokens
- Only callable by Timelock
- USDT and OSLO explicitly blocked from rescue

---

### Contract H — OSLOLiquidityManager (`OSLOLiquidityManager.sol`, 127 lines)

**Purpose**: Protocol-controlled liquidity routing. No PancakeSwap — routes directly to OSLODEX.

#### Operations

**`addInitialLiquidity(usdtAmount)`** (Admin only, once):
1. Uses all OSLO held by contract (100K DEX seed)
2. Approves both USDT and OSLO for OSLODEX
3. Calls `OSLODEX.addInitialLiquidity(usdt, oslo)`

**`addLiquidityFromFees(usdtAmount)`** (Permissionless, called by Treasury):
1. Approves OSLODEX to pull USDT
2. Calls `OSLODEX.addLiquidityFromFees(usdt)` — USDT-only LP addition
3. No OSLO paired — DEX price auto-adjusts

**`rescueERC20(token, amount)`** (Timelock only):
- Rescues accidentally sent non-protocol tokens
- USDT and OSLO blocked

---

## IV. Cross-Contract Integration Flows

### Full User Journey

```
[1] User visits dApp → Connects wallet via RainbowKit

[2] Registration (Landing page):
    ├─ First user: register(user, address(0)) — Root
    ├─ Subsequent: register(user, referrer) — must provide valid referrer
    ├─ $1 USDT fee: transferred from user → swapped for OSLO on DEX → OSLO burned
    └─ USDT from fee enters DEX as permanent liquidity

[3] Deposit Flow (/invest):
    ├─ approve USDT for InvestmentEngine
    ├─ deposit(amount) executes:
    │   ├─ safeTransferFrom USDT from user (NO fee)
    │   ├─ forceApprove OSLODEX → processDeposit(amount)
    │   │   └─ DEX: receives USDT (+reserve), sends OSLO to IE (-reserve)
    │   ├─ Create Deposit struct with tier + dailyRate
    │   ├─ checkAndUnlockLevels(user)
    │   └─ _recordTurnoverForUplines → RankSystem.recordTurnover × 20 levels

[4] Claim Rewards (/invest):
    ├─ Calculate: pending = amount × rate × time / (86400 × 10000)
    ├─ Check: totalClaimed + pending ≤ 3X cap AND totalCombined ≤ 3X
    ├─ Apply 10% withdrawal fee
    ├─ Convert net USDT → OSLO at DEX spot price
    ├─ Transfer OSLO to user from IE reserve
    └─ 5% profit → distributeReferralCommission(user, profit)
        └─ Traverse 20 uplines, accrue USDT commissions

[5] Early Exit (/invest, within 10 days):
    ├─ Deduct: accruedYield + 10% exitFee
    ├─ Return: principal - deductions in USDT
    └─ Mark deposit inactive

[6] Referral Claim (/referrals):
    └─ claimReferralRewards() → USDT from contract balance

[7] Weekly Rank Bonus (/ranks):
    ├─ claimRankBonus() for previous completed week
    ├─ Requires 40/60 leg ratio qualification
    ├─ Bonus = weeklyTurnover × rankBonusBP / 10000
    └─ Paid in USDT from bonus pool

[8] DAO Royalty (/dao):
    ├─ claimRoyalty() for previous completed month
    ├─ Equal share of 0.5% of monthly turnover
    └─ Paid in USDT from royalty pool

[9] Treasury Distribution (/treasury):
     └─ Anyone calls distribute()
         └─ 100% USDT → LiquidityManager → OSLODEX as liquidity
```

### Inter-Contract Wiring

```
OSLOToken
├── isSellEndpoint[OSLODEX] = true          (triggers sell tax)
├── investmentEngine = OSLOInvestmentEngine  (70% of sells)
└── liquidityManager = OSLOLiquidityManager  (setup reference)

OSLODEX
├── liquidityManager = OSLOLiquidityManager  (initial LP + fee LP)
├── investmentEngine = OSLOInvestmentEngine  (processDeposit/Withdrawal)

OSLOInvestmentEngine
├── osloDex = OSLODEX                       (deposits/withdrawals/price)
├── referral = OSLOReferral                  (unlock levels, turnover, commissions)
├── rankSystem = OSLORankSystem              (recordTurnover)
└── treasury = OSLOTreasury                  (fee routing)

OSLOReferral
├── investmentEngine = OSLOInvestmentEngine  (check active deposit, notifyLevelIncome)
├── osloDex = OSLODEX                        (registration fee swap → burn)

OSLORankSystem
├── investmentEngine = OSLOInvestmentEngine  (notifyRankBonus for 3X cap)
├── referral = OSLOReferral                  (getDirectReferrals for leg ratio)

OSLODAO
├── investmentEngine = OSLOInvestmentEngine  (notifyLevelIncome for 3X cap)

OSLOTreasury
├── rankSystem = OSLORankSystem              (receiveBonusPool)
├── dao = OSLODAO                            (receiveRoyaltyPool)
└── liquidityManager = OSLOLiquidityManager  (100% distribution)

OSLOLiquidityManager
└── oslodex = OSLODEX                        (all liquidity routing)
```

---

## V. USDT Flow Map

```
                   +------------------+
                   | User Wallet      |
                   | (USDT + OSLO)   |
                   +--+-------+-------+
                      |       |
         Registration |       | Deposit
         $1 fee       |       | (full amount)
                      v       v
              +-------+-------+-------+
              | OSLOReferral  | IE    |
              | (swap→burn)   |       |
              +-------+-------+-------+
                      |       |
          USDT stays  |       | processDeposit
          in DEX      |       v
                      |  +----+----+
                      +->| OSLODEX |<--+
                         +----+----+   |
                              |        |
              addLiquidity   |        | processWithdrawal
              FromFees       |        | (principal return)
                              v        |
                         +----+----+   |
                         | Treasury|   |
                         | 100%→LP |---+
                         +---------+

Sell (OSLO→USDT):
  User sends OSLO → OSLOToken applies 30% burn + 70% to IE
  OSLODEX receives 0 OSLO, sends USDT to user
  USDT stays in DEX (reserve decreases by output amount)
```

---

## VI. Frontend Architecture

### Technology Stack

| Layer          | Technology                        |
|----------------|-----------------------------------|
| Framework      | Next.js 14 (App Router)           |
| Language       | TypeScript 5+                     |
| Styling        | Tailwind CSS + CSS variables      |
| Web3           | wagmi v2 + viem                   |
| Wallet         | RainbowKit (custom themed)        |
| State          | Zustand (`useAppStore`)           |
| Data Fetching  | TanStack Query (via wagmi)        |
| Animation      | Framer Motion                     |
| Icons          | Lucide React                      |

### File Structure
```
frontend/src/
├── abis/                          # Contract ABI JSON files (9 contracts)
├── app/
│   ├── layout.tsx                 # Root layout + RegistrationGuard
│   ├── providers.tsx              # wagmi + RainbowKit providers
│   ├── globals.css                # Design tokens (dark theme only)
│   ├── page.tsx                   # Landing (3 states)
│   ├── swap/page.tsx              # OSLO/USDT swap interface
│   ├── invest/page.tsx            # Staking: deposit, claim, early exit
│   ├── referrals/page.tsx         # Referral tree + commission claim
│   ├── ranks/page.tsx             # Rank status + bonus claim
│   ├── dao/page.tsx               # DAO membership + royalty claim
│   └── treasury/page.tsx          # Treasury distribution
├── components/
│   ├── layout/                    # Navbar, Sidebar, BottomNav, Background
│   ├── ui/                        # GlassCard, IceButton, TierBadge, ProgressRing
│   ├── RegistrationGuard.tsx      # Redirects unregistered to /
│   └── ErrorBoundary.tsx
├── hooks/                         # Per-contract read/write hooks (8 files)
├── lib/
│   ├── contracts.ts               # Deployed addresses (9 contracts)
│   ├── constants.ts               # Mirrors OSLOConstants.sol (184 lines)
│   └── utils.ts                   # formatToken, formatNumber, truncateAddress
└── store/
    └── useAppStore.ts             # Global state + toast system
```

### Key Pages

| Page         | Description                                               |
|--------------|-----------------------------------------------------------|
| `/`          | Landing: Disconnected → Register → Dashboard (3 states)   |
| `/swap`      | Buy/sell OSLO with DEX price + 30% burn info              |
| `/invest`    | One-click approve+deposit, claim, early exit, withdraw    |
| `/referrals` | Tree view, level income, commission claim                 |
| `/ranks`     | Current rank, weekly turnover, bonus claim                |
| `/dao`       | Membership status, monthly royalty claim                  |
| `/treasury`  | Fee balance, permissionless distribute button             |

---

## VII. Subgraph Schema

```
Entities:
├── Protocol (singleton: totalStats, totalDeposited, totalBurned...)
├── Account (address, isRegistered, referrer, directCount, teamSize...)
├── Deposit (user, amount, tier, depositTime, lastClaim, totalClaimed, active)
├── ReferralReward (upline, downline, level, amount, txHash, timestamp)
├── RankSnapshot (user, weekId, turnover, rank, bonus, claimed)
├── DAOMember (user, memberNumber, qualifiedAt)
├── RoyaltyClaim (user, monthId, amount, timestamp)
├── TreasuryDistribution (amount, toLP, timestamp)
├── LiquidityEvent (type: Add/Swap, usdtAmount, osloAmount)
├── WeeklyTurnover (user, weekId, amount)
└── OSLOStats (totalBurned, totalLiquidity, totalVolume)
```

**Events indexed** (7 data sources):
- OSLOToken: `SellTaxApplied`, `SetupCompleted`, `SellEndpointSet`
- OSLOInvestmentEngine: `Deposited`, `RewardsClaimed`, `EarlyExited`
- OSLOReferral: `UserRegistered`, `LevelUnlocked`, `ReferralPaid`, `ReferralRewardsClaimed`
- OSLORankSystem: `RankAchieved`, `RankBonusClaimed`, `TurnoverRecorded`
- OSLODAO: `DAOMemberQualified`, `RoyaltyClaimed`
- OSLOTreasury: `FeesReceived`, `Distributed`
- OSLOLiquidityManager: `LiquidityAdded`

---

## VIII. Constants Reference (from OSLOConstants.sol)

### Token Supply
| Constant            | Value              | Description                |
|---------------------|--------------------|----------------------------|
| TOTAL_SUPPLY        | 11,100,000 × 1e18  | Fixed total                |
| CONTRACT_RESERVE    | 11,000,000 × 1e18  | Held by InvestmentEngine   |
| DEX_ALLOCATION      | 100,000 × 1e18     | DEX seed via LiquidityMgr  |

### Fees & Tax
| Constant               | BP    | %     | Description                   |
|------------------------|-------|-------|-------------------------------|
| SELL_TAX_BP            | 1,000 | 10%   | Fee burn per sell             |
| SELL_TAX_TO_CONTRACT_BP| 7,000 | 70%   | → InvestmentEngine            |
| SELL_TAX_TO_BURN_BP    | 2,000 | 20%   | Additional deflationary burn  |
| WITHDRAWAL_FEE_BP      | 1,000 | 10%   | On reward claims              |
| EARLY_EXIT_FEE_BP      | 1,000 | 10%   | Early exit penalty            |

### Tiers & Rates
| Tier | Min – Max       | Rate Range |
|------|-----------------|------------|
| 1    | $10 – $499      | 0.50%–1.00% |
| 2    | $500 – $2,499   | 0.75%–1.15% |
| 3    | $2,500 – $4,999 | 1.00%–1.50% |
| 4    | $5,000–$50,000  | 1.00%–1.75% |

Lifetime rate: 0.45% daily (45 bp) after 3 months. Max deposit: $5,000 per tx. Min withdrawal: $10.

### Referral Commissions
| Levels   | BP    | Rate  |
|----------|-------|-------|
| L1       | 3,000 | 30%   |
| L2       | 2,000 | 20%   |
| L3–L10   | 100   | 1.00% |
| L11–L15  | 50    | 0.50% |
| L16–L20  | 25    | 0.25% |

### Ranks
| # | Name        | Turnover      | Bonus BP | Bonus % |
|---|-------------|---------------|----------|---------|
| 1 | Bronze      | $10,000       | 100      | 1.00%   |
| 2 | Silver      | $25,000       | 50       | 0.50%   |
| 3 | Gold        | $75,000       | 30       | 0.30%   |
| 4 | Platinum    | $200,000      | 20       | 0.20%   |
| 5 | Diamond     | $500,000      | 15       | 0.15%   |
| 6 | Master      | $1,200,000    | 10       | 0.10%   |
| 7 | Grandmaster | $2,500,000    | 5        | 0.05%   |

### Other
| Constant               | Value              | Description                    |
|------------------------|--------------------|--------------------------------|
| RETURN_CAP_MULTIPLIER  | 3                  | 3X combined cap                |
| MAX_DAO_MEMBERS        | 200                | Hard cap                       |
| DAO_TEAM_SIZE          | 250                | Team members to qualify        |
| DAO_MONTHLY_ROYALTY_BP | 50                 | 0.5% monthly                   |
| MAX_BURN_SUPPLY        | 9,990,000 × 1e18   | 90% burn cap                   |
| EARLY_EXIT_PERIOD      | 10 days            | Exit window from deposit       |
| LAUNCH_TIMESTAMP       | 1,778,371,200      | May 10, 2026 UTC               |
| LIFETIME_RATE_START    | 90 days            | 3 months after launch          |
| RANK_MAIN_LEG_MAX_BP   | 4,000              | 40% max for rank qualification |

---

## IX. Security Model

### Governance Lifecycle
1. **Deployment** → Admin = deployer (EOA)
2. **Configuration** → Admin sets routing addresses, whitelists, endpoints
3. **Timelock Transfer** → Admin transfers control to Timelock contract
4. **Setup Completion** → `completeSetup()` renounces admin (`admin = address(0)`)
5. **Post-Setup** → Only Timelock can call protected functions (pause deposits, rescue tokens)

### Immutable After Setup
- Sell tax percentages (hardcoded constants)
- Tier boundaries and rates (hardcoded constants)
- Referral commission rates (hardcoded constants)
- Rank thresholds and bonuses (hardcoded constants)
- Burn cap (hardcoded)
- Launch timestamp (immutable constructor param)

### Timelock-Controlled (Post-Setup)
- Emergency pause new deposits (`setDepositsPaused`)
- Update referral contract address (`setReferral`)
- Rescue accidentally-sent non-protocol tokens

### Protection Mechanisms
- **ReentrancyGuard** on all state-changing public functions
- **Zero-address checks** on all address parameters
- **Protocol token rescue blocked**: USDT, OSLO cannot be rescued from Treasury/LiquidityManager
- **Burn cap**: Prevents burning beyond 90% of supply
- **3X cap**: Prevents infinite yield extraction per deposit
- **40/60 leg ratio**: Prevents single-leg dominance for rank qualification
- **One claim per week/month**: Prevents double-claiming
