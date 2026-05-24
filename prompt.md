Build OSLO Protocol — 100% Decentralized BEP-20 DeFi Platform
1. Core Philosophy & Non-Negotiable Decentralization Rules
Zero Admin Keys: No onlyOwner functions that can withdraw user funds, change reward rates, or pause contracts arbitrarily.
Immutable Parameters: Investment tiers, referral percentages, rank bonuses, and tokenomics are hardcoded constants or governed by a DAO timelock (minimum 48-hour delay).
Automated Execution: All rewards, referrals, rank calculations, and burns execute via smart contract logic. No off-chain oracle or human intervention for routine operations.
Transparency: All state variables must be public/external. Emits detailed events for every deposit, withdrawal, referral payout, rank achievement, burn, and compounding action.
Trustless Upgrades: If upgradeable patterns are used, they must be via a DAO Governor + Timelock contract. No proxy admin owned by an EOA.
2. Technical Stack
Network: Binance Smart Chain (BSC) Mainnet
Standard: BEP-20 (OpenZeppelin ERC-20 base)
Solidity Version: ^0.8.19
Framework: Hardhat or Foundry with comprehensive test suite (minimum 95% coverage)
Libraries: OpenZeppelin Contracts (SafeERC20, ReentrancyGuard, Address)
3. Smart Contract Architecture (7 Contracts)
Contract A: OSLOToken (BEP-20)
Purpose: Native utility token with deflationary mechanics.
Requirements:
Total Supply: Fixed 11,100,000 OSLO minted entirely at genesis.
Distribution:
1,322,000 OSLO → EarlyAdopterVault (locked, claimable by tiered merkle proofs or linear vesting per the 9-tier early adopter schedule in the spec).
497,000 OSLO → DAOVault (reserved for DAO entry royalties and governance).
Remainder → LiquidityVault + Treasury (for initial LP and ecosystem).
Transfer Tax: 0% on standard transfers. A 10% fee applies only on Sell/Withdraw transactions (as per token utility page):
90% to LiquidityPool (auto-paired with BNB/BUSD via router).
10% burned permanently (sent to 0xdead).
Burn Tracking: Public totalBurned counter.
No Minting: No mint() function exists after deployment. Supply is capped.
Contract B: OSLOInvestmentEngine (Core Staking)
Purpose: Handles deposits, daily yield accrual, 10-day trial, 3X cap, and compounding.
Requirements:
Investment Tiers (hardcoded structs):
Table
Tier	Range	Daily Return	Investment Split	Profit Split	Total Return Cap
1	$10 – $499	2.50%	2.00%	0.50%	3X
2	$500 – $2,499	2.75%	2.25%	0.50%	3X
3	$2,500 – $4,999	3.00%	2.50%	0.50%	3X
4	$5,000 – $9,999	3.25%	2.75%	0.50%	3X
5	$10,000+	3.50%	3.00%	0.50%	3X
Deposit Mechanics:
Accepts BUSD (stablecoin) as the primary deposit currency.
5% platform fee on deposit: 100% auto-routed to OSLOTreasury (for rank bonuses/DAO royalties). No EOA can touch this; it is distributed algorithmically.
User receives an internal "active deposit" balance. Capital stays active (no lock-in after trial).
10-Day Trial Period:
Each new deposit starts a 10-day trial timer.
Early Exit (Day 1–10): User can withdraw principal. Penalty = 10% of principal.
90% of penalty → LiquidityPool.
10% of penalty → OSLO Token Burn (buy OSLO from LP and burn).
Post-Trial (Day 11+): Unlimited daily claims. No withdrawal penalty on principal.
Daily Returns Accrual:
Rewards accrue block-by-block based on block.timestamp.
Formula: pending = (depositAmount * tierDailyRate * timeElapsed) / (1 day in seconds * 10000).
Returns are tracked separately as "investment return" and "profit return" to match the tier split table.
3X Total Return Cap:
Each deposit tracks totalClaimed.
When totalClaimed >= 3 * depositAmount, that deposit stops yielding. Principal remains in "active" state for referral calculations but no longer generates new rewards.
Compounding:
Users can compound earned rewards back into their active deposit.
Compounding is treated as a new deposit (subject to 5% fee, starts new 10-day trial on compounded amount, assigned to appropriate tier).
Event: Compounded(user, amount, newTier).
Withdrawal:
Users claim accrued rewards. 10% sell fee applies if converting to OSLO (per token utility spec).
Principal can be withdrawn anytime post-trial with 0% penalty.
Contract C: OSLOReferral (20-Level Referral System)
Purpose: Decentralized referral tree, level unlocking, and commission distribution.
Requirements:
Registration: New users must provide a valid referrer address. First 20,000 registrants receive an OSLO airdrop from EarlyAdopterVault (handled via OSLOToken merkle claim or direct transfer if within threshold).
Referral Tree: Each user has a referrer (upline). Max 20 levels deep. Store directReferrals[] and qualifiedDirectsCount.
Level Unlock Conditions (hardcoded):
Table
Levels Unlocked	Qualified Directs Required	Cumulative Total Required
1–3	1	1
4–8	1	2
9–12	1	3
13–16	2	5
17–20	2	7
A "qualified direct" = direct referral with ≥$100 active deposit.
Unlock is automatic via checkAndUnlockLevels(user) called on every deposit/withdrawal.
Referral Commission Structure (paid on the profit portion only of downline daily earnings, not principal):
Level 1: 30%
Level 2: 20%
Levels 3–10: 1.00%
Levels 11–15: 0.50%
Levels 16–20: 0.25%
Distribution: Commissions accrue in BUSD to a referralRewards[user] mapping. Users claim via claimReferralRewards(). No auto-send to prevent gas griefing.
Events: LevelUnlocked(user, level), ReferralPaid(upline, downline, level, amount).
Contract D: OSLORankSystem (Weekly Turnover Bonus)
Purpose: Calculates weekly team turnover and distributes progressive rank bonuses.
Requirements:
Ranks (hardcoded):
Table
Rank	Weekly Turnover	Bonus %
OSLO-1	$10,000	1.00%
OSLO-2	$25,000	0.50%
OSLO-3	$75,000	0.30%
OSLO-4	$200,000	0.20%
OSLO-5	$500,000	0.15%
OSLO-6	$1,200,000	0.10%
OSLO-7	$2,500,000	0.05%
Progressive (Not Cumulative) Logic:
A user receives the bonus only for their highest achieved rank in a given week.
If they achieve OSLO-3, they get 0.30% on their team's weekly turnover. They do not also receive OSLO-1 + OSLO-2 bonuses.
If their turnover drops next week, their rank drops and bonus adjusts accordingly.
Weekly Turnover Calculation:
Turnover = sum of all new deposits + compounds from their entire downline (20 levels) within the Monday 00:00 UTC to Sunday 23:59 UTC window.
Snapshot taken automatically. Use block.timestamp modulo 1 week to determine epochs.
Bonus Distribution:
Bonus pool funded from the 5% deposit fee treasury.
At week end, calculate bonus = weeklyTurnover * rankBonusPercent / 10000.
Distributed in BUSD. Users call claimRankBonus().
Events: RankAchieved(user, rank, weekId, turnover), RankBonusClaimed(user, amount, weekId).
Contract E: OSLODAO (Decentralized Governance & Royalty)
Purpose: DAO entry qualification and decentralized protocol governance.
Requirements:
DAO Entry:
Track the first 200 individuals who achieve a team of 250+ members (cumulative across 20 levels).
Qualification is permanent and stored in a daoMembers[] array + isDAOMember[address] mapping.
Once qualified, they receive a monthly royalty = 0.5% of total protocol turnover (from the previous month).
Royalty is claimable from DAOVault (funded by protocol fees).
Governance (if any parameter changes are ever needed):
Use OpenZeppelin Governor + TimelockController.
Proposal threshold: 1% of OSLO supply.
Voting period: 3 days.
Timelock delay: 48 hours.
Only the Timelock can call updateParameter() functions on other contracts. No EOA can.
Contract F: OSLOTreasury (Fee Router)
Purpose: Autonomous fee management. No withdrawal function for any EOA.
Requirements:
Receives all 5% deposit fees.
Receives trial-period penalties.
Automatically routes funds:
70% → RankSystem (weekly bonus pool).
20% → DAO (monthly royalty pool).
10% → LiquidityPool (paired with OSLO).
All distributions happen via distribute() called permissionlessly (can be triggered by any user, incentivized by a small gas rebate in OSLO).
Contract G: OSLOLiquidityManager
Purpose: Automated liquidity provision and OSLO buyback/burn.
Requirements:
Receives BUSD from treasury and penalties.
Uses PancakeSwap Router (BSC) to auto-swap 50% of received BUSD for OSLO.
Adds liquidity (OSLO + BUSD) to the OSLO/BUSD LP pool. LP tokens are sent to 0xdead (permanently locked).
For burn operations: swaps BUSD to OSLO and sends to 0xdead.
4. Cross-Contract Integration Flow
User deposits BUSD into OSLOInvestmentEngine.
5% fee auto-routed to OSLOTreasury.
OSLOReferral checks upline, unlocks levels, accrues commissions.
OSLORankSystem updates weekly turnover for all 20 uplines.
Daily rewards accrue block-by-block in OSLOInvestmentEngine.
User claims → if swapping to OSLO, OSLOToken applies 10% sell tax (90% LP, 10% burn).
OSLOTreasury distributes to Rank/DAO/Liquidity pools autonomously.
5. Security & Decentralization Checklist
[ ] Use ReentrancyGuard on all state-changing functions.
[ ] Use SafeERC20 for all token transfers.
[ ] No selfdestruct, no delegatecall to arbitrary addresses.
[ ] No admin function to migrate funds.
[ ] All percentage calculations use basis points (10000 = 100%) to prevent rounding errors.
[ ] Implement emergency pause() only for new deposits (not withdrawals), and only callable by DAO Timelock after 48h delay.
[ ] All contracts verified on BscScan with full source code.
[ ] Include a rescueERC20(address token, uint amount) function only for tokens accidentally sent to the contract, callable only by DAO Timelock, and explicitly blocked for BUSD/OSLO to prevent rug pulls.
6. Testing Requirements (Write Complete Test Suite)
Unit Tests: Each contract in isolation (deposit, withdraw, trial penalty math, 3X cap, referral level unlocking, rank progression).
Integration Tests: Full user journey (Registration → Deposit → Trial → Referral → Rank → Compound → DAO Qualification).
Edge Cases:
Early exit on day 5 vs day 11.
3X cap exact boundary.
Referral commission exhaustion (what if upline hasn't unlocked enough levels?).
Rank downgrade after a high-turnover week.
Reentrancy attacks on claim functions.
Fork Tests: Deploy on BSC fork and test PancakeSwap liquidity additions.
7. Deployment Parameters
OSLO Token: Deploy first. Mint 11.1M to a temporary deployer, then immediately transfer allocations to vault contracts. Renounce minter role.
Vaults: Deploy EarlyAdopterVault, DAOVault, Treasury, LiquidityManager.
Core Logic: Deploy Referral, RankSystem, InvestmentEngine.
Linking: Wire all contract addresses via constructor/setter functions. Once linked, transfer ownership of all contracts to the TimelockController.
DAO: Deploy Governor + Timelock. Transfer Timelock admin to itself. Transfer contract ownerships to Timelock.
Verification: Verify all contracts. Publish constructor arguments.
8. Frontend / Subgraph (Optional but Recommended)
Build a React frontend (Next.js) reading directly from BSC RPC.
Display: Active deposit, pending rewards, trial timer, referral tree visualization, current rank, DAO status.
Subgraph (The Graph) to index ReferralPaid, RankAchieved, Compounded events for fast UI loading.
Final Instruction for AI Agent: Generate the complete, production-ready Solidity codebase following the architecture above. Ensure all mathematical formulas are exact, all percentages are hardcoded constants, and the system is fully autonomous after deployment. Include NatSpec comments, deployment scripts, and a comprehensive Hardhat test suite. The protocol must function without any human admin from day one.