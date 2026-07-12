import { ethers } from "hardhat";

/**
 * DEEP DEBUG: Full earnings audit for a wallet.
 *
 * Checks ALL sources of earnings:
 *   1. Staking yield (accrued, claimable, claimed)
 *   2. Level commissions (from LevelIncomeSystem)
 *   3. recordExternalEarning events (against 3X cap)
 *   4. Referral tree (directs, upline, team size)
 *   5. Level eligibility (which levels unlocked)
 *   6. Token balances (USDT, OSLO)
 *   7. Event history (LevelCommissionPaid, YieldClaimed, ExternalEarningRecorded)
 *
 * Usage: npx hardhat run scripts/debug/debug-full-earnings.ts --network bscMainnet
 */

const TARGET_WALLET = "0xcce25f9953A8226722cD87c834fbB1A1E448a77F";

const ENGINE_ADDR = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const LEVEL_SYSTEM_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const REFERRAL_REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const OSLO_TOKEN_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function stakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive))",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function paused() view returns (bool)",
  "event YieldClaimed(address indexed user, uint256 totalClaimable, uint256 osloAmount, uint256 osloPrice)",
  "event ExternalEarningRecorded(address indexed user, uint256 usdtAmount)",
  "event Staked(address indexed user, uint256 amount, uint8 tier, address referrer, uint256 timestamp)",
  "event ThreeXCapReached(address indexed user, uint256 totalEarnings, uint256 cap)",
];

const LEVEL_ABI = [
  "function totalCommissionsEarned(address) view returns (uint256)",
  "function levels(uint256) view returns (uint256 level, uint256 rate, uint256 directsRequired)",
  "event LevelCommissionPaid(address indexed recipient, address indexed claimer, uint256 level, uint256 usdtValue, uint256 osloAmount, uint256 timestamp)",
];

const REFERRAL_ABI = [
  "function directReferrer(address) view returns (address)",
  "function getUpline(address, uint256) view returns (address)",
  "function getDirectDownlines(address) view returns (address[])",
  "function getDirectDownlineCount(address) view returns (uint256)",
  "function getTeamSize(address) view returns (uint256)",
  "function isRegistered(address) view returns (bool)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, signer);
  const levelSystem = new ethers.Contract(LEVEL_SYSTEM_ADDR, LEVEL_ABI, signer);
  const registry = new ethers.Contract(REFERRAL_REGISTRY_ADDR, REFERRAL_ABI, signer);
  const osloToken = new ethers.Contract(OSLO_TOKEN_ADDR, ERC20_ABI, signer);
  const usdtToken = new ethers.Contract(USDT_ADDR, ERC20_ABI, signer);

  console.log("=".repeat(70));
  console.log("DEEP EARNINGS AUDIT");
  console.log("=".repeat(70));
  console.log(`Wallet: ${TARGET_WALLET}`);
  console.log(`Time:   ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  // ============ 1. STAKING DATA ============
  console.log("\n" + "═".repeat(70));
  console.log("1. STAKING DATA");
  console.log("═".repeat(70));

  const isPaused = await engine.paused();
  const hasStaked = await engine.hasStaked(TARGET_WALLET);
  const stakes = await engine.getUserStakes(TARGET_WALLET);
  const aggregated = await engine.stakes(TARGET_WALLET);
  const claimableYield = await engine.getClaimableYield(TARGET_WALLET);
  const accruedYield = await engine.calculateAccruedYield(TARGET_WALLET);
  const totalClaimed = await engine.totalClaimed(TARGET_WALLET);
  const seededEarnings = await engine.seededEarnings(TARGET_WALLET);
  const totalActiveStake = await engine.getTotalActiveStake(TARGET_WALLET);

  console.log(`  Contract Paused:    ${isPaused}`);
  console.log(`  Has Staked:         ${hasStaked}`);
  console.log(`  Total Active Stake: ${ethers.formatUnits(totalActiveStake, 18)} USDT`);
  console.log(`  Seeded Earnings:    ${ethers.formatUnits(seededEarnings, 18)} USDT`);
  console.log(`  Accrued Yield:      ${ethers.formatUnits(accruedYield, 18)} USDT (total staking yield since start)`);
  console.log(`  Total Claimed:      ${ethers.formatUnits(totalClaimed, 18)} USDT (claimed by user)`);
  console.log(`  Claimable Now:      ${ethers.formatUnits(claimableYield, 18)} USDT`);
  console.log(`  Stake count:        ${stakes.length}`);

  console.log("\n  Aggregated stake (what LevelIncomeSystem sees via stakes()):");
  console.log(`    activeStake:    ${ethers.formatUnits(aggregated.activeStake, 18)} USDT`);
  console.log(`    totalEarnings:  ${ethers.formatUnits(aggregated.totalEarnings, 18)} USDT (includes seededEarnings)`);
  console.log(`    isActive:       ${aggregated.isActive}`);
  console.log(`    tier:           ${aggregated.tier}`);

  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    const cap = s.activeStake * 3n;
    const effective = s.totalEarnings + seededEarnings;
    const elapsed = now - Number(s.stakeStartTime);
    const days = Math.floor(elapsed / 86400);
    const hours = Math.floor((elapsed % 86400) / 3600);

    console.log(`\n  Stake #${i + 1}:`);
    console.log(`    Amount:          ${ethers.formatUnits(s.activeStake, 18)} USDT`);
    console.log(`    Tier:            ${s.tier}`);
    console.log(`    Active:          ${s.isActive}`);
    console.log(`    totalEarnings:   ${ethers.formatUnits(s.totalEarnings, 18)} USDT (yield claimed + external earnings recorded)`);
    console.log(`    Seeded:          ${ethers.formatUnits(seededEarnings, 18)} USDT`);
    console.log(`    Effective:       ${ethers.formatUnits(effective, 18)} USDT`);
    console.log(`    3X Cap:          ${ethers.formatUnits(cap, 18)} USDT`);
    console.log(`    Cap Used:        ${cap > 0n ? (Number(effective) / Number(cap) * 100).toFixed(2) : 0}%`);
    console.log(`    Start:           ${new Date(Number(s.stakeStartTime) * 1000).toISOString()}`);
    console.log(`    Elapsed:         ${days}d ${hours}h`);
  }

  // ============ 2. REFERRAL TREE ============
  console.log("\n" + "═".repeat(70));
  console.log("2. REFERRAL TREE");
  console.log("═".repeat(70));

  const isRegistered = await registry.isRegistered(TARGET_WALLET);
  const referrer = await registry.directReferrer(TARGET_WALLET);
  const directs = await registry.getDirectDownlines(TARGET_WALLET);
  const directCount = await registry.getDirectDownlineCount(TARGET_WALLET);
  const teamSize = await registry.getTeamSize(TARGET_WALLET);

  console.log(`  Registered:      ${isRegistered}`);
  console.log(`  Referrer:        ${referrer}`);
  console.log(`  Direct Count:    ${directCount}`);
  console.log(`  Team Size:       ${teamSize}`);
  console.log(`  Direct Downlines:`);
  for (let i = 0; i < directs.length; i++) {
    // Check if each direct has staked
    const directStakes = await engine.getUserStakes(directs[i]);
    const directActive = await engine.getTotalActiveStake(directs[i]);
    const directClaimed = await engine.totalClaimed(directs[i]);
    console.log(`    [${i + 1}] ${directs[i]}`);
    console.log(`        Active Stake: ${ethers.formatUnits(directActive, 18)} USDT, Stakes: ${directStakes.length}, Claimed: ${ethers.formatUnits(directClaimed, 18)} USDT`);
  }

  // ============ 3. LEVEL ELIGIBILITY ============
  console.log("\n" + "═".repeat(70));
  console.log("3. LEVEL ELIGIBILITY (20-level commission structure)");
  console.log("═".repeat(70));

  console.log(`  Direct count: ${directCount}`);
  console.log("");
  console.log("  Level | Rate    | Directs Required | Eligible?");
  console.log("  ------|---------|------------------|----------");

  let highestEligibleLevel = 0;
  for (let i = 0; i < 20; i++) {
    const level = await levelSystem.levels(i);
    const eligible = Number(directCount) >= Number(level.directsRequired);
    if (eligible) highestEligibleLevel = i + 1;
    console.log(`  ${String(level.level).padStart(5)} | ${(Number(level.rate) / 100).toFixed(2)}% | ${String(level.directsRequired).padStart(16)} | ${eligible ? "✅" : "❌"}`);
  }
  console.log(`\n  Highest eligible level: ${highestEligibleLevel}`);

  // ============ 4. LEVEL COMMISSIONS ============
  console.log("\n" + "═".repeat(70));
  console.log("4. LEVEL COMMISSIONS (from LevelIncomeSystem)");
  console.log("═".repeat(70));

  const totalCommissions = await levelSystem.totalCommissionsEarned(TARGET_WALLET);
  console.log(`  Total Commissions Earned: ${ethers.formatUnits(totalCommissions, 18)} USDT (in USDT value)`);
  console.log(`  (This is the USDT-value of OSLO tokens received as level commissions)`);

  // ============ 5. EVENT HISTORY ============
  console.log("\n" + "═".repeat(70));
  console.log("5. EVENT HISTORY");
  console.log("═".repeat(70));

  const currentBlock = await ethers.provider.getBlockNumber();
  const fromBlock = currentBlock - 5000; // ~ last 4 hours

  async function safeQuery(contract: any, filter: any, label: string) {
    try {
      return await contract.queryFilter(filter, fromBlock);
    } catch (e: any) {
      console.log(`  (Skipped ${label} — RPC limit exceeded)`);
      return [];
    }
  }

  // 5a. LevelCommissionPaid events (recipient = this user)
  console.log("\n  --- LevelCommissionPaid (received as upline) ---");
  const commissionEvents = await safeQuery(levelSystem, levelSystem.filters.LevelCommissionPaid(TARGET_WALLET), "LevelCommissionPaid");
  console.log(`  Total commission events: ${commissionEvents.length}`);

  let totalCommissionUSDT = 0n;
  let totalCommissionOSLO = 0n;
  for (const event of commissionEvents) {
    const args = (event as any).args;
    totalCommissionUSDT += args.usdtValue;
    totalCommissionOSLO += args.osloAmount;
    console.log(`    Block ${event.blockNumber}: Level ${args.level} | From: ${args.claimer} | USDT: ${ethers.formatUnits(args.usdtValue, 18)} | OSLO: ${ethers.formatUnits(args.osloAmount, 18)}`);
  }
  console.log(`  Total from events: ${ethers.formatUnits(totalCommissionUSDT, 18)} USDT → ${ethers.formatUnits(totalCommissionOSLO, 18)} OSLO`);

  // 5b. ExternalEarningRecorded events
  console.log("\n  --- ExternalEarningRecorded (against 3X cap) ---");
  const externalEvents = await safeQuery(engine, engine.filters.ExternalEarningRecorded(TARGET_WALLET), "ExternalEarningRecorded");
  console.log(`  Total external earning events: ${externalEvents.length}`);

  let totalExternalUSDT = 0n;
  for (const event of externalEvents) {
    const args = (event as any).args;
    totalExternalUSDT += args.usdtAmount;
    console.log(`    Block ${event.blockNumber}: USDT: ${ethers.formatUnits(args.usdtAmount, 18)}`);
  }
  console.log(`  Total from events: ${ethers.formatUnits(totalExternalUSDT, 18)} USDT`);

  // 5c. YieldClaimed events (by this user)
  console.log("\n  --- YieldClaimed (by this user) ---");
  const yieldEvents = await safeQuery(engine, engine.filters.YieldClaimed(TARGET_WALLET), "YieldClaimed");
  console.log(`  Total yield claim events: ${yieldEvents.length}`);

  let totalYieldClaimed = 0n;
  for (const event of yieldEvents) {
    const args = (event as any).args;
    totalYieldClaimed += args.totalClaimable;
    console.log(`    Block ${event.blockNumber}: USDT: ${ethers.formatUnits(args.totalClaimable, 18)} → OSLO: ${ethers.formatUnits(args.osloAmount, 18)} @ $${ethers.formatUnits(args.osloPrice, 18)}`);
  }
  console.log(`  Total claimed from events: ${ethers.formatUnits(totalYieldClaimed, 18)} USDT`);

  // 5d. Staked events (by this user)
  console.log("\n  --- Staked (by this user) ---");
  const stakedEvents = await safeQuery(engine, engine.filters.Staked(TARGET_WALLET), "Staked");
  console.log(`  Total stake events: ${stakedEvents.length}`);
  for (const event of stakedEvents) {
    const args = (event as any).args;
    console.log(`    Block ${event.blockNumber}: Amount: ${ethers.formatUnits(args.amount, 18)} USDT, Tier: ${args.tier}, Referrer: ${args.referrer}`);
  }

  // 5e. ThreeXCapReached events
  console.log("\n  --- ThreeXCapReached (for this user) ---");
  const capEvents = await safeQuery(engine, engine.filters.ThreeXCapReached(TARGET_WALLET), "ThreeXCapReached");
  console.log(`  Total cap events: ${capEvents.length}`);
  for (const event of capEvents) {
    const args = (event as any).args;
    console.log(`    Block ${event.blockNumber}: totalEarnings: ${ethers.formatUnits(args.totalEarnings, 18)}, cap: ${ethers.formatUnits(args.cap, 18)}`);
  }

  // ============ 6. TOKEN BALANCES ============
  console.log("\n" + "═".repeat(70));
  console.log("6. TOKEN BALANCES");
  console.log("═".repeat(70));

  const osloBalance = await osloToken.balanceOf(TARGET_WALLET);
  const usdtBalance = await usdtToken.balanceOf(TARGET_WALLET);
  console.log(`  OSLO Balance: ${ethers.formatUnits(osloBalance, 18)} OSLO`);
  console.log(`  USDT Balance: ${ethers.formatUnits(usdtBalance, 18)} USDT`);

  // ============ 7. DOWNLINE YIELD CLAIM ACTIVITY ============
  console.log("\n" + "═".repeat(70));
  console.log("7. DOWNLINE YIELD CLAIM ACTIVITY");
  console.log("═".repeat(70));
  console.log("  (Level commissions are ONLY distributed when downline claims yield)");
  console.log("");

  let totalDownlineClaims = 0;
  let totalDownlineClaimedUSDT = 0n;

  for (let i = 0; i < directs.length; i++) {
    const direct = directs[i];
    const directYieldEvents = await safeQuery(engine, engine.filters.YieldClaimed(direct), `YieldClaimed(${direct})`);
    let directClaimed = 0n;
    for (const event of directYieldEvents) {
      directClaimed += (event as any).args.totalClaimable;
    }
    const directClaimedOnChain = await engine.totalClaimed(direct);
    console.log(`  Direct [${i + 1}] ${direct}:`);
    console.log(`    Claims (recent): ${directYieldEvents.length}, Total claimed (on-chain): ${ethers.formatUnits(directClaimedOnChain, 18)} USDT`);
    totalDownlineClaims += directYieldEvents.length;
    totalDownlineClaimedUSDT += directClaimed;
  }

  // Also check who triggered commissions for this user
  console.log("\n  Checking who triggered commissions for this user...");
  if (commissionEvents.length > 0) {
    const claimers = new Set<string>();
    for (const event of commissionEvents) {
      claimers.add((event as any).args.claimer);
    }
    console.log(`  Unique claimers who triggered commissions: ${claimers.size}`);
    for (const claimer of claimers) {
      const directRef = await registry.directReferrer(claimer);
      console.log(`    Claimer: ${claimer} (their referrer: ${directRef})`);
    }
  } else {
    console.log("  (Commission events not available in this block range.)");
    console.log("  Using on-chain totalCommissionsEarned instead:");
    console.log(`  Total commissions earned: ${ethers.formatUnits(totalCommissions, 18)} USDT (in OSLO value)`);
  }

  console.log(`\n  Total downline yield claims (recent): ${totalDownlineClaims}`);
  console.log(`  Total downline claimed USDT (recent): ${ethers.formatUnits(totalDownlineClaimedUSDT, 18)} USDT`);

  // ============ 8. COMPREHENSIVE SUMMARY ============
  console.log("\n" + "═".repeat(70));
  console.log("8. COMPREHENSIVE EARNINGS SUMMARY");
  console.log("═".repeat(70));

  const stakingYieldClaimed = totalClaimed;
  const levelCommissionsUSDT = totalCommissions;
  const totalEarningsAll = stakingYieldClaimed + levelCommissionsUSDT;
  const cap3x = totalActiveStake * 3n;

  console.log(`  Staking yield claimed:     ${ethers.formatUnits(stakingYieldClaimed, 18)} USDT`);
  console.log(`  Level commissions earned:  ${ethers.formatUnits(levelCommissionsUSDT, 18)} USDT (received as OSLO)`);
  console.log(`  Total earnings (all types): ${ethers.formatUnits(totalEarningsAll, 18)} USDT`);
  console.log(`  3X Cap:                    ${ethers.formatUnits(cap3x, 18)} USDT`);
  console.log(`  Cap progress:              ${cap3x > 0n ? (Number(totalEarningsAll) / Number(cap3x) * 100).toFixed(2) : 0}%`);
  console.log("");
  console.log(`  Accrued staking yield:     ${ethers.formatUnits(accruedYield, 18)} USDT (total since stake start)`);
  console.log(`  Claimable now:             ${ethers.formatUnits(claimableYield, 18)} USDT`);

  // ============ 9. DIAGNOSIS ============
  console.log("\n" + "═".repeat(70));
  console.log("9. DIAGNOSIS");
  console.log("═".repeat(70));

  let issues = 0;

  // Check if stakes have totalEarnings inflated by recordExternalEarning
  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    if (s.isActive && s.totalEarnings > 0n) {
      // Check if totalEarnings > totalClaimed (means external earnings were recorded)
      if (s.totalEarnings > stakingYieldClaimed) {
        console.log(`  ⚠ Stake #${i + 1}: totalEarnings (${ethers.formatUnits(s.totalEarnings, 18)}) > totalClaimed (${ethers.formatUnits(stakingYieldClaimed, 18)})`);
        console.log(`    → totalEarnings inflated by recordExternalEarning (level commissions)`);
        console.log(`    → This blocks staking yield claims because accrued (${ethers.formatUnits(accruedYield, 18)}) <= totalEarnings (${ethers.formatUnits(s.totalEarnings, 18)})`);
        console.log(`    → The contract uses totalEarnings for BOTH yield tracking AND cap enforcement`);
        issues++;
      }
    }
  }

  // Check if level commissions are flowing
  if (commissionEvents.length === 0) {
    console.log(`  ⚠ No LevelCommissionPaid events found for this user!`);
    console.log(`    → No downline member has claimed yield that triggered commissions`);
    console.log(`    → Level commissions ONLY flow when downline calls claimYield()`);
    if (directs.length === 0) {
      console.log(`    → User has NO direct referrals — cannot earn level commissions`);
    } else {
      console.log(`    → User has ${directs.length} direct referrals, but none have claimed yield yet`);
    }
    issues++;
  }

  // Check level eligibility
  if (highestEligibleLevel === 0) {
    console.log(`  ⚠ User is not eligible for ANY level commissions (0 direct referrals)`);
    issues++;
  }

  if (issues === 0) {
    console.log("  ✅ No issues detected — all earnings are flowing correctly.");
  }

  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
