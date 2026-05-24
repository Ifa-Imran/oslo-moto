Project Overview
Build the official decentralized application (dApp) frontend for OSLO Protocol, a multi-tiered DeFi investment ecosystem built on BNB Smart Chain. The platform features staking with daily yields, a 20-level referral system, weekly rank bonuses, DAO royalty distributions, automated liquidity management, and a deflationary native token with sell-tax mechanics.
Design Philosophy: Nordic-futurism meets institutional DeFi — clean, cold, precise, luminous. Think Stockholm fintech meets cyberpunk utility. No cartoonish DeFi tropes. No gradient overload. Surgical elegance.
Tech Stack
Table
Layer	Technology
Framework	Next.js 14+ (App Router)
Language	TypeScript
Styling	Tailwind CSS + custom CSS variables
UI Components	shadcn/ui (customized)
Web3 Library	wagmi/viem (preferred) or ethers.js v6
Wallet Connection	RainbowKit or ConnectKit
Data Fetching	TanStack Query (React Query) v5
Charts	Recharts or Visx (custom themed)
Animation	Framer Motion + GSAP for complex sequences
Icons	Lucide React (custom stroke widths)
State Management	Zustand
Design System
Color Palette
css
Copy
:root {
  /* Core Surface */
  --oslo-void: #05070a;           /* Deepest background */
  --oslo-base: #0a0f17;           /* Primary background */
  --oslo-elevated: #111827;       /* Cards, panels */
  --oslo-floating: #1a2332;       /* Hover states, dropdowns */
  
  /* Accent — Nordic Ice */
  --oslo-ice: #00e5ff;            /* Primary CTA, active states */
  --oslo-ice-dim: rgba(0, 229, 255, 0.1);
  --oslo-ice-glow: rgba(0, 229, 255, 0.4);
  
  /* Secondary — Aurora */
  --oslo-aurora: #7c3aed;         /* Rank tiers, DAO elements */
  --oslo-aurora-dim: rgba(124, 58, 237, 0.1);
  
  /* Semantic */
  --oslo-success: #10b981;
  --oslo-warning: #f59e0b;
  --oslo-danger: #ef4444;
  --oslo-danger-dim: rgba(239, 68, 68, 0.1);
  
  /* Text */
  --oslo-text-primary: #f8fafc;
  --oslo-text-secondary: #94a3b8;
  --oslo-text-muted: #475569;
  --oslo-text-ice: #00e5ff;
}
Typography
Primary: Inter or Geist (variable font) — clean, geometric, highly legible at small sizes
Display/Numbers: JetBrains Mono or SF Mono — for all financial figures, percentages, and data tables
Scale:
Hero: 48–64px, weight 300, tracking -0.02em
H1: 32px, weight 500
H2: 24px, weight 500
Body: 14px, weight 400, line-height 1.5
Data/Numbers: 14–16px, weight 500, tabular nums
Visual Language
Glassmorphism: backdrop-blur-xl, bg-white/5, border-white/10 for modals and floating panels
Borders: 1px solid with low opacity (border-white/10), subtle inner glow on hover
Radii: 12px for cards, 8px for buttons, 16px for modals
Shadows: No heavy drop shadows. Use layered box-shadows with ice/aurora tints for elevation:
css
Copy
box-shadow: 0 0 0 1px rgba(0,229,255,0.1), 0 4px 24px rgba(0,0,0,0.4);
Grid: Subtle dot-grid or 1px line-grid background pattern at 5% opacity on dark sections
Global Layout Architecture
Navigation — Command Bar
Fixed top bar, 64px height, backdrop-blur-md, bottom border white/5
Left: OSLO logo (minimalist geometric "O" mark + wordmark)
Center: Navigation links — Dashboard, Invest, Referrals, Ranks, DAO, Treasury
Right:
Network indicator (BSC icon + "BNB Chain")
Wallet connect button (custom styled RainbowKit)
Wallet balance display (BUSD + OSLO) when connected
Sidebar (Desktop) / Bottom Bar (Mobile)
Collapsible sidebar (240px) on desktop with:
User profile card (avatar, rank badge, total active deposit)
Quick stats: Total Earnings, Team Size, Unlocked Levels
Navigation with active-state ice-border-left indicator
Mobile: Bottom sheet navigation with 5 primary tabs
Background
Animated subtle mesh gradient (void → base) using CSS or WebGL canvas
Very slow-moving aurora-like color shifts (ice/aurora at 3% opacity)
Optional: Particle network effect connecting nodes on hero sections
Page Specifications
1. Dashboard (Home)
The command center. Information density with clear hierarchy.
Hero Section:
Large typographic greeting: "Protocol Overview"
Three primary metric cards in a row:
Total Value Locked — Large mono number, 24h change indicator, mini sparkline
OSLO Token Price — Price in BUSD, 24h %, market cap, circulating supply with burn counter animation
Your Portfolio — Total deposited, total claimed, total referrals earned, rank badge
Quick Actions Grid (2x2):
Deposit BUSD (primary CTA — ice glow border)
Claim Rewards
Compound Position
View Referral Tree
Active Deposits Table:
Columns: Tier (1–5 with color-coded badges), Amount, Daily Rate, Accrued Rewards, Time Active, Status (Active/Trial/Capped), Actions (Claim/Compound/Withdraw)
Progress bar showing 3X cap progress per deposit
Trial period countdown timer (if applicable)
Recent Activity Feed:
Scrollable list of latest transactions: Deposits, Claims, Compounds, Rank Ups, Referral Commissions
Each item has icon, description, amount, timestamp, tx link
2. Invest (Staking Engine)
The core interaction surface. Must feel like a professional trading terminal.
Deposit Interface:
Split-panel layout: Left (deposit form), Right (tier calculator)
Form: Amount input (BUSD), Tier preview (auto-calculates based on amount), Expected daily yield, 3X cap projection, 10-day trial indicator
Tier Visualizer: Vertical stepper showing 5 tiers:
Tier 1: $50+ (rate displayed)
Tier 2: $500+
Tier 3: $2,500+
Tier 4: $10,000+
Tier 5: $50,000+
Active tier highlighted with ice glow, inactive tiers muted
Deposit Flow:
User enters amount → real-time tier highlight
Referrer input (optional, validates if address is registered)
Approve BUSD → Deposit (two-step with clear state indicators)
Success modal with deposit receipt and tx hash
Portfolio Management:
Card grid of individual deposits (not just a table)
Each deposit card shows:
Tier badge (top-right)
Principal amount
Accrued: Investment Return + Profit Return (split visualization)
3X Cap progress ring (circular progress, 75% = warning color, 100% = capped)
Action buttons: Claim, Compound, Withdraw Principal
If in trial period: prominent badge + "Penalty-free withdrawal ends in: 06:23:14:09"
3. Referrals (Network)
The 20-level tree visualization. Must be performant and visually stunning.
Personal Referral Dashboard:
Header Stats: Referral Link (copy button), Total Directs, Qualified Directs, Unlocked Levels (e.g., "12 / 20"), Total Team Size, Total Commissions Earned
Level Unlock Progress: Horizontal segmented bar showing qualified directs needed for next unlock:
1→3: 1 qualified
4→8: 2 qualified
9→12: 3 qualified
13→16: 5 qualified
17→20: 7 qualified
Tree Visualization:
Default View: Collapsible tree (first 3 levels expanded)
Each node: Circular avatar (blockie), address (0x123...abc), active deposit amount, direct count
Lines connecting nodes use SVG paths with ice-colored strokes
Current user highlighted with aurora glow
Zoom and pan capabilities (d3-zoom or custom implementation)
Search bar to find specific downline by address
Commission Breakdown Panel: Side drawer showing rates per level:
L1: 10%
L2: 5%
L3–10: 2%
L11–15: 1%
L16–20: 0.5%
(Display as vertical bar chart or tiered list)
Rewards Panel:
Claimable referral rewards (BUSD)
"Claim All" button
History of past claims
4. Ranks (Weekly Competition)
Gamified but sophisticated. Dark leaderboard aesthetic.
Current Week Dashboard:
Timer: Large countdown to week end (Mon 00:00 UTC)
Your Current Rank: Prominent card showing:
Rank icon (7 distinct rank badges, from bronze to diamond/celestial)
Current weekly turnover
Required turnover for next rank
Projected bonus if week ended now
Claim button (disabled if current week)
Rank Ladder (7 Ranks):
Vertical progression path showing all 7 ranks:
Bronze — $1,000 turnover — 1% bonus
Silver — $5,000 — 2%
Gold — $25,000 — 3%
Platinum — $100,000 — 4%
Diamond — $500,000 — 5%
Master — $2,000,000 — 6%
Grandmaster — $10,000,000 — 7%
Current rank pulsing with ice glow, future ranks locked with muted styling
Progress bar between current and next rank
Leaderboard:
Table of top 50 performers this week
Columns: Rank, Address, Weekly Turnover, Achieved Rank, Estimated Bonus
Highlight current user row with bg-ice-dim
Historical Performance:
Line chart showing user's weekly turnover over last 12 weeks
Bar chart showing bonuses claimed per week
5. DAO (Governance & Royalties)
Exclusive, elite feel. Limited to 200 members.
DAO Status Panel:
Large counter: "XXX / 200 DAO Members Qualified"
If user is member: Elite badge, member number (e.g., "Member #047"), qualification date
If not member: Requirements checklist:
✓ Team size: 247/250 (progress bar)
⏳ Available slots: 153 remaining
Monthly Royalty Interface:
Current month ID and claim status
Previous month stats:
Total protocol turnover
Royalty pool (0.5% of turnover)
Number of DAO members
Your calculated share
"Claim Royalty" button (disabled if already claimed or no royalty)
History table: Month, Turnover, Pool, Your Share, Status
DAO Members List:
Grid of member cards (address, member #, team size, join date)
Optional: Anonymized view unless user is also DAO member
6. Treasury & Tokenomics
Transparency page. Institutional reporting aesthetic.
Treasury Overview:
Real-time fee distribution visualization:
Total fees received (all-time)
Pending distribution amount
"Distribute" button (permissionless, incentivized)
Pie/donut chart showing allocation:
40% Rank System
30% DAO Royalty Pool
30% Liquidity Management
Tokenomics Dashboard:
OSLO Token Metrics:
Total Supply: 10,000,000 (fixed)
Circulating Supply
Total Burned (animated counter, live from contract)
Burned via Sell Tax vs. Buyback
Sell Tax Visualizer:
10% tax breakdown: 9% to LP, 1% Burn
Animated flow diagram showing token path from seller → LP → Burn
Liquidity Management:
Total liquidity added (BUSD + OSLO)
Total burned via buyback
Recent buyback transactions
LP token lock verification (linked to dead address on BscScan)
Component Library Requirements
Custom Components
GlassCard: backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all
IceButton: Primary CTA with subtle ice glow, active state scale(0.98)
TierBadge: Color-coded pills (Tier 1: slate, Tier 2: blue, Tier 3: cyan, Tier 4: purple, Tier 5: ice-glow)
RankBadge: 7 distinct SVG badges with metallic gradients
ProgressRing: Circular progress for 3X cap, SVG-based with gradient stroke
CountdownTimer: Monospace, segment-display style for trial periods and week ends
AddressChip: Truncated address with copy icon and blockie avatar
TxToast: Custom notification system for transaction states (pending, success, error)
Modals
DepositModal: Multi-step (approve → confirm → success)
WithdrawModal: Principal amount, penalty warning (red if in trial), confirm
CompoundModal: Preview of new deposit tier, fee display
RankClaimModal: Success animation with rank badge reveal
Web3 Integration Specifications
Contract Interactions
Use viem with wagmi hooks. Implement robust error handling for common revert reasons.
Required Read Functions:
OSLOInvestmentEngine.getActiveDeposit(user)
OSLOInvestmentEngine.getUserTier(user)
OSLOInvestmentEngine.getPendingRewards(user, index)
OSLOInvestmentEngine.userDeposits(user, index) (iterate depositCount)
OSLOReferral.isRegistered(user), getReferrer, getDirectReferrals, getUnlockedLevels, getTeamSize, referralRewards
OSLORankSystem.getCurrentRank, getWeeklyTurnover, getPendingBonus, getCurrentWeekId
OSLODAO.isDAOMember, getPendingRoyalty, daoMemberCount
OSLOToken.totalBurned, balanceOf
OSLOTreasury.totalReceived, pendingDistribution
Required Write Functions:
OSLOInvestmentEngine.deposit(amount, referrer)
OSLOInvestmentEngine.claimRewards(index)
OSLOInvestmentEngine.withdrawPrincipal(index)
OSLOInvestmentEngine.compound(index)
OSLOReferral.claimReferralRewards()
OSLORankSystem.claimRankBonus()
OSLODAO.claimRoyalty()
OSLOTreasury.distribute() (permissionless)
OSLOToken.approve (for sell tax interactions if needed)
Event Listening
Real-time updates for: Deposited, RewardsClaimed, RankAchieved, RoyaltyClaimed, BuybackBurned
Use useContractEvent or viem watchContractEvent
Error Handling
Map contract revert reasons to user-friendly toast messages:
DepositTooLow → "Minimum deposit is 50 BUSD"
DepositsPausedError → "Deposits are temporarily paused by protocol governance"
AlreadyClaimed → "You've already claimed this reward"
InsufficientRoyaltyPool → "Royalty pool is being replenished. Try again soon."
Animation & Interaction Design
Page Transitions
Route changes: Fade out (150ms) → Fade in (300ms) with 20px Y translate
Use Next.js <AnimatePresence>
Micro-interactions
Buttons: active:scale-[0.98], hover glow intensification
Cards: Subtle Y-lift on hover (translateY(-2px))
Numbers: Count-up animation on mount (use countup.js or custom hook)
Progress bars: Smooth width transitions (500ms, ease-out)
Success states: Confetti or particle burst on rank achievement, deposit confirmation
Loading States
Skeleton screens for all data cards (shimmer effect, bg-gradient-to-r from-white/5 to-white/10)
Button loading: Spinner inside button, disabled state
Tx pending: Toast with BscScan link, pulsing border
Responsive Breakpoints
Table
Breakpoint	Layout Adjustments
>= 1536px	Full sidebar, 4-column grids, expanded tree view
1280–1535px	Compact sidebar, 3-column grids
1024–1279px	Collapsible sidebar, 2-column grids
768–1023px	Hidden sidebar (hamburger), stacked layouts
< 768px	Single column, bottom nav, simplified tree (list view), full-width cards
Performance Requirements
Lighthouse Score: 90+ across all metrics
First Contentful Paint: < 1.5s
Time to Interactive: < 3.5s
Bundle Size: < 200KB initial JS (use dynamic imports for heavy components like tree visualization)
RPC Optimization: Batch read calls using multicall where possible
Images: WebP format, lazy loading, blur-up placeholders
Security & UX Considerations
Slippage Warnings: For any token swaps (if integrated later)
Trial Period Warning: Prominent banner when withdrawing principal within 10 days showing exact penalty amount
3X Cap Notification: Toast when user is approaching cap, suggesting compound or new deposit
Contract Verification: All contract addresses linked to BscScan with verified badges
Read-only Mode: Graceful degradation when wallet not connected (show demo data or prompts)
Mobile Wallet: Deep linking to MetaMask/Trust Wallet for mobile users
Deliverables Checklist
[ ] Next.js project scaffold with TypeScript, Tailwind, shadcn/ui
[ ] wagmi/viem configuration with BSC mainnet/testnet
[ ] RainbowKit/ConnectKit integration with custom theming
[ ] All 6 pages with full responsive layouts
[ ] Contract interaction hooks (custom useContract hooks)
[ ] Global state management (Zustand store for user data)
[ ] Toast/notification system for transactions
[ ] Dark mode only (no light mode needed — stay true to the void aesthetic)
[ ] SEO metadata, OpenGraph images, favicon
[ ] Error boundaries and 404 page
[ ] Deployment-ready (Vercel/Netlify configuration)
* must work with all type of browsers and dapp wallets
Final Note: This frontend should feel like operating a premium financial terminal from the year 2030. Every pixel, every animation, every interaction should reinforce trust, precision, and sophistication. The user should feel like they're participating in something elite and technologically superior. Avoid clutter. Embrace negative space. Let the ice glow guide the eye.