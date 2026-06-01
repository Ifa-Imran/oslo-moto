import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * OSLO Protocol — Complete BSC Testnet Full Data Snapshot
 *
 * Reads ALL state from every deployed contract on BSC Testnet (chain 97).
 * Outputs a comprehensive JSON file matching the mainnet snapshot format.
 *
 * Run:
 *   npx hardhat run scripts/snapshot-testnet-full.ts --network bscTestnet
 */

// ─── Load addresses from deployment file ────────────────────────────────────
const addrPath = path.join(__dirname, "..", "data", "testnet-addresses.json");
const addrData = JSON.parse(fs.readFileSync(addrPath, "utf-8"));

const ADDRESSES = {
  USDT: addrData.USDT,
  OSLOToken: addrData.OSLOToken,
  OSLODEX: addrData.OSLODEX,
  OSLOTreasury: addrData.OSLOTreasury,
  OSLOLiquidityManager: addrData.OSLOLiquidityManager,
  OSLODAO: addrData.OSLODAO,
  OSLORankSystem: addrData.OSLORankSystem,
  OSLOReferral: addrData.OSLOReferral,
  OSLOInvestmentEngine: addrData.OSLOInvestmentEngine,
};

const DEPLOYER = addrData.deployer;
const KNOWN_ROOTS = [DEPLOYER];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: bigint) => ethers.formatEther(v);

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     OSLO Protocol — BSC Testnet Full Data Snapshot      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ─── Connect to contracts ──────────────────────────────────────────────────
  const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES.USDT);
  const osloToken = await ethers.getContractAt("OSLOToken", ADDRESSES.OSLOToken);
  const dex = await ethers.getContractAt("OSLODEX", ADDRESSES.OSLODEX);
  const treasury = await ethers.getContractAt("OSLOTreasury", ADDRESSES.OSLOTreasury);
  const liquidityMgr = await ethers.getContractAt("OSLOLiquidityManager", ADDRESSES.OSLOLiquidityManager);
  const dao = await ethers.getContractAt("OSLODAO", ADDRESSES.OSLODAO);
  const rankSystem = await ethers.getContractAt("OSLORankSystem", ADDRESSES.OSLORankSystem);
  const referral = await ethers.getContractAt("OSLOReferral", ADDRESSES.OSLOReferral);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", ADDRESSES.OSLOInvestmentEngine);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PROTOCOL GLOBALS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("─── 1. Reading Protocol Globals ───\n");

  // OSLOToken
  const totalSupply = await osloToken.totalSupply();
  const totalBurned = await osloToken.totalBurned();
  const tokenSetupComplete = await osloToken.setupComplete();
  const tokenAdmin = await osloToken.admin();
  console.log(`  OSLOToken: supply=${fmt(totalSupply)}, burned=${fmt(totalBurned)}, admin=${tokenAdmin}`);

  // OSLODEX
  const [usdtReserve, osloReserve] = await dex.getReserves();
  const dexPrice = await dex.getPrice();
  const totalVolumeUSDT = await dex.totalVolumeUSDT();
  const totalSwaps = await dex.totalSwaps();
  const lastPrice = await dex.lastPrice();
  console.log(`  OSLODEX: price=${fmt(dexPrice)}, usdtRes=${fmt(usdtReserve)}, osloRes=${fmt(osloReserve)}`);

  // OSLOInvestmentEngine
  const totalDeposited = await investmentEngine.totalDeposited();
  const totalWithdrawn = await investmentEngine.totalWithdrawn();
  const totalRewardsPaid = await investmentEngine.totalRewardsPaid();
  const depositsPaused = await investmentEngine.depositsPaused();
  const minClaimThreshold = await investmentEngine.minClaimThreshold();
  console.log(`  InvestmentEngine: deposited=${fmt(totalDeposited)}, withdrawn=${fmt(totalWithdrawn)}, rewards=${fmt(totalRewardsPaid)}`);

  // OSLOReferral
  const totalRegistered = await referral.totalRegistered();
  const totalCommissionsPaid = await referral.totalCommissionsPaid();
  const totalFeesCollected = await referral.totalFeesCollected();
  console.log(`  Referral: registered=${totalRegistered}, commissions=${fmt(totalCommissionsPaid)}, fees=${fmt(totalFeesCollected)}`);

  // OSLORankSystem
  const currentWeekId = await rankSystem.getCurrentWeekId();
  const bonusPoolBalance = await rankSystem.bonusPoolBalance();
  const totalBonusesDistributed = await rankSystem.totalBonusesDistributed();
  const rankGenesisTimestamp = await rankSystem.genesisTimestamp();
  console.log(`  RankSystem: weekId=${currentWeekId}, pool=${fmt(bonusPoolBalance)}, distributed=${fmt(totalBonusesDistributed)}`);

  // OSLODAO
  const daoMemberCount = await dao.daoMemberCount();
  const royaltyPoolBalance = await dao.royaltyPoolBalance();
  const totalRoyaltiesDistributed = await dao.totalRoyaltiesDistributed();
  const currentMonthId = await dao.getCurrentMonthId();
  const daoGenesisTimestamp = await dao.genesisTimestamp();
  let daoMembers: string[] = [];
  try { daoMembers = await dao.getAllDAOMembers(); } catch { /* empty */ }
  console.log(`  DAO: members=${daoMemberCount}, pool=${fmt(royaltyPoolBalance)}, monthId=${currentMonthId}`);

  // OSLOTreasury
  const treasuryTotalReceived = await treasury.totalReceived();
  const treasuryTotalDistributed = await treasury.totalDistributed();
  const pendingDistribution = await treasury.pendingDistribution();
  console.log(`  Treasury: received=${fmt(treasuryTotalReceived)}, distributed=${fmt(treasuryTotalDistributed)}`);

  // OSLOLiquidityManager
  const totalLiquidityAdded = await liquidityMgr.totalLiquidityAdded();
  console.log(`  LiquidityManager: totalAdded=${fmt(totalLiquidityAdded)}`);

  // ─── Contract Token Balances ──────────────────────────────────────────────
  console.log("\n─── Contract Token Balances ───\n");
  const contractBalances: Record<string, { usdt: string; oslo: string }> = {};
  for (const [name, addr] of Object.entries(ADDRESSES)) {
    if (name === "USDT" || name === "OSLOToken") continue;
    const usdtBal = await usdt.balanceOf(addr);
    const osloBal = await osloToken.balanceOf(addr);
    contractBalances[name] = { usdt: fmt(usdtBal), oslo: fmt(osloBal) };
    console.log(`  ${name}: USDT=${fmt(usdtBal)}, OSLO=${fmt(osloBal)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. USER DISCOVERY (BFS)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n─── 2. Discovering All Users via BFS ───\n");

  interface UserNode {
    address: string;
    referrer: string;
    unlockedLevels: number;
    directReferralCount: number;
    totalEarned: string;
    referralRewards: string;
    teamSize: number;
    qualifiedDirects: number;
    levelIncome: string[];
  }

  const userNodes: UserNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [...KNOWN_ROOTS];

  while (queue.length > 0) {
    const addr = queue.shift()!;
    if (visited.has(addr.toLowerCase())) continue;

    try {
      const info = await referral.userInfo(addr);
      if (!info.registered) continue;

      visited.add(addr.toLowerCase());

      let directs: string[] = [];
      try { directs = await referral.getDirectReferrals(addr); } catch { /* */ }

      for (const child of directs) {
        if (!visited.has(child.toLowerCase())) queue.push(child);
      }

      let teamSize = 0;
      try { teamSize = Number(await referral.getTeamSize(addr)); } catch { /* */ }

      let qualifiedDirects = 0;
      try { qualifiedDirects = Number(await referral.getQualifiedDirectsCount(addr)); } catch { /* */ }

      const rewards = await referral.referralRewards(addr);

      let allLevelIncome: bigint[] = [];
      try { allLevelIncome = await referral.getAllLevelIncome(addr); } catch { /* */ }

      userNodes.push({
        address: addr,
        referrer: info.referrer,
        unlockedLevels: Number(info.unlockedLevels),
        directReferralCount: directs.length,
        totalEarned: fmt(info.totalEarned),
        referralRewards: fmt(rewards),
        teamSize,
        qualifiedDirects,
        levelIncome: allLevelIncome.map((v: bigint) => fmt(v)),
      });

      console.log(
        `  [${userNodes.length}] ${addr} -> ref: ${info.referrer === ethers.ZeroAddress ? "ROOT" : info.referrer.slice(0, 10) + "..."} | L${Number(info.unlockedLevels)} | ${directs.length} directs | team=${teamSize}`
      );
    } catch (err: any) {
      console.error(`  Error reading ${addr}: ${err.message}`);
    }
  }

  console.log(`\n  Total users found: ${userNodes.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DEPOSITS & INVESTMENT DATA PER USER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n─── 3. Reading Investment Deposits ───\n");

  interface DepositData {
    owner: string;
    index: number;
    amount: string;
    tier: number;
    dailyRate: number;
    depositTime: number;
    lastClaimTime: number;
    totalClaimed: string;
    maxReturn: string;
    active: boolean;
    pendingRewards: string;
  }

  interface UserInvestmentData {
    address: string;
    totalActiveDeposit: string;
    depositCount: number;
    totalCombinedEarnings: string;
    tier: number;
    usdtBalance: string;
    osloBalance: string;
  }

  const allDeposits: DepositData[] = [];
  const userInvestmentData: UserInvestmentData[] = [];

  for (const user of userNodes) {
    try {
      const depositCount = Number(await investmentEngine.getDepositCount(user.address));
      const userInfo = await investmentEngine.users(user.address);
      const tier = Number(await investmentEngine.getUserTier(user.address));
      const usdtBal = await usdt.balanceOf(user.address);
      const osloBal = await osloToken.balanceOf(user.address);

      userInvestmentData.push({
        address: user.address,
        totalActiveDeposit: fmt(userInfo.totalActiveDeposit),
        depositCount,
        totalCombinedEarnings: fmt(userInfo.totalCombinedEarnings),
        tier,
        usdtBalance: fmt(usdtBal),
        osloBalance: fmt(osloBal),
      });

      if (depositCount === 0) continue;

      console.log(`  ${user.address}: ${depositCount} deposit(s), tier=${tier}, active=${fmt(userInfo.totalActiveDeposit)}`);

      for (let i = 0; i < depositCount; i++) {
        const dep = await investmentEngine.userDeposits(user.address, i);
        let pending = 0n;
        try { pending = await investmentEngine.getPendingRewards(user.address, i); } catch { /* */ }

        allDeposits.push({
          owner: user.address,
          index: i,
          amount: fmt(dep.amount),
          tier: Number(dep.tier),
          dailyRate: Number(dep.dailyRate),
          depositTime: Number(dep.depositTime),
          lastClaimTime: Number(dep.lastClaimTime),
          totalClaimed: fmt(dep.totalClaimed),
          maxReturn: fmt(dep.maxReturn),
          active: dep.active,
          pendingRewards: fmt(pending),
        });
      }
    } catch (err: any) {
      console.error(`  Error reading deposits for ${user.address}: ${err.message}`);
    }
  }

  console.log(`\n  Total deposits: ${allDeposits.length} (active: ${allDeposits.filter(d => d.active).length})`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RANK SYSTEM DATA PER USER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n─── 4. Reading Rank System Data ───\n");

  interface UserRankData {
    address: string;
    currentRank: number;
    isQualified: boolean;
    currentWeekTurnover: string;
    pendingBonus: string;
  }

  const userRankData: UserRankData[] = [];
  const weekId = Number(currentWeekId);

  for (const user of userNodes) {
    try {
      const rank = Number(await rankSystem.getCurrentRank(user.address));
      const qualified = await rankSystem.isRankQualified(user.address);
      const weekTurnover = await rankSystem.getWeeklyTurnover(user.address, weekId);
      let pendingBonus = 0n;
      try { pendingBonus = await rankSystem.getPendingBonus(user.address); } catch { /* */ }

      if (rank > 0 || weekTurnover > 0n || pendingBonus > 0n) {
        userRankData.push({
          address: user.address,
          currentRank: rank,
          isQualified: qualified,
          currentWeekTurnover: fmt(weekTurnover),
          pendingBonus: fmt(pendingBonus),
        });
        console.log(`  ${user.address}: rank=${rank}, qualified=${qualified}, turnover=${fmt(weekTurnover)}`);
      }
    } catch (err: any) {
      console.error(`  Error reading rank for ${user.address}: ${err.message}`);
    }
  }

  console.log(`  Users with rank data: ${userRankData.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. DAO DATA
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n─── 5. Reading DAO Data ───\n");

  interface DAOMemberData { address: string; pendingRoyalty: string; }
  const daoMemberData: DAOMemberData[] = [];

  for (const member of daoMembers) {
    try {
      const pending = await dao.getPendingRoyalty(member);
      daoMemberData.push({ address: member, pendingRoyalty: fmt(pending) });
      console.log(`  ${member}: pendingRoyalty=${fmt(pending)}`);
    } catch (err: any) {
      console.error(`  Error reading DAO for ${member}: ${err.message}`);
    }
  }

  const monthId = Number(currentMonthId);
  const monthlyTurnovers: Record<number, string> = {};
  for (let m = 1; m <= monthId; m++) {
    try {
      const turnover = await dao.monthlyTurnover(m);
      if (turnover > 0n) monthlyTurnovers[m] = fmt(turnover);
    } catch { /* */ }
  }

  console.log(`  DAO members: ${daoMemberData.length}, monthly turnovers: ${Object.keys(monthlyTurnovers).length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. TOPOLOGICAL SORT
  // ═══════════════════════════════════════════════════════════════════════════
  const sorted: UserNode[] = [];
  const added = new Set<string>();

  for (const user of userNodes) {
    if (user.referrer === ethers.ZeroAddress) {
      sorted.push(user);
      added.add(user.address.toLowerCase());
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const user of userNodes) {
      if (added.has(user.address.toLowerCase())) continue;
      if (added.has(user.referrer.toLowerCase())) {
        sorted.push(user);
        added.add(user.address.toLowerCase());
        changed = true;
      }
    }
  }

  for (const user of userNodes) {
    if (!added.has(user.address.toLowerCase())) sorted.push(user);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ASSEMBLE & WRITE SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n─── Assembling Snapshot ───\n");

  const snapshot = {
    meta: {
      network: "bscTestnet",
      chainId: 97,
      snapshotTime: new Date().toISOString(),
      blockNumber: await ethers.provider.getBlockNumber(),
      deployer: DEPLOYER,
      contracts: ADDRESSES,
    },
    protocolGlobals: {
      osloToken: {
        totalSupply: fmt(totalSupply),
        totalBurned: fmt(totalBurned),
        setupComplete: tokenSetupComplete,
        admin: tokenAdmin,
      },
      osloDex: {
        usdtReserve: fmt(usdtReserve),
        osloReserve: fmt(osloReserve),
        currentPrice: fmt(dexPrice),
        lastPrice: fmt(lastPrice),
        totalVolumeUSDT: fmt(totalVolumeUSDT),
        totalSwaps: Number(totalSwaps),
      },
      investmentEngine: {
        totalDeposited: fmt(totalDeposited),
        totalWithdrawn: fmt(totalWithdrawn),
        totalRewardsPaid: fmt(totalRewardsPaid),
        depositsPaused,
        minClaimThreshold: fmt(minClaimThreshold),
      },
      referral: {
        totalRegistered: Number(totalRegistered),
        totalCommissionsPaid: fmt(totalCommissionsPaid),
        totalFeesCollected: fmt(totalFeesCollected),
      },
      rankSystem: {
        currentWeekId: Number(currentWeekId),
        bonusPoolBalance: fmt(bonusPoolBalance),
        totalBonusesDistributed: fmt(totalBonusesDistributed),
        genesisTimestamp: Number(rankGenesisTimestamp),
      },
      dao: {
        memberCount: Number(daoMemberCount),
        members: daoMembers,
        royaltyPoolBalance: fmt(royaltyPoolBalance),
        totalRoyaltiesDistributed: fmt(totalRoyaltiesDistributed),
        currentMonthId: Number(currentMonthId),
        genesisTimestamp: Number(daoGenesisTimestamp),
        monthlyTurnovers,
      },
      treasury: {
        totalReceived: fmt(treasuryTotalReceived),
        totalDistributed: fmt(treasuryTotalDistributed),
        pendingDistribution: fmt(pendingDistribution),
      },
      liquidityManager: {
        totalLiquidityAdded: fmt(totalLiquidityAdded),
      },
    },
    contractBalances,
    users: sorted.map((u) => ({
      address: u.address,
      referrer: u.referrer,
      unlockedLevels: u.unlockedLevels,
      directReferralCount: u.directReferralCount,
      totalEarned: u.totalEarned,
      referralRewards: u.referralRewards,
      teamSize: u.teamSize,
      qualifiedDirects: u.qualifiedDirects,
      levelIncome: u.levelIncome,
    })),
    userInvestments: userInvestmentData,
    deposits: allDeposits,
    rankData: userRankData,
    daoData: {
      members: daoMemberData,
      monthlyTurnovers,
    },
    summary: {
      totalUsers: sorted.length,
      totalDeposits: allDeposits.length,
      activeDeposits: allDeposits.filter(d => d.active).length,
      usersWithRankActivity: userRankData.length,
      daoMembers: daoMemberData.length,
    },
  };

  // Write output
  const outputDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "testnet-snapshot-full.json");
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                  SNAPSHOT COMPLETE                       ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Users:           ${String(sorted.length).padStart(6)}                              ║`);
  console.log(`║  Deposits:        ${String(allDeposits.length).padStart(6)} (active: ${String(allDeposits.filter(d => d.active).length).padStart(4)})            ║`);
  console.log(`║  Rank entries:    ${String(userRankData.length).padStart(6)}                              ║`);
  console.log(`║  DAO members:     ${String(daoMemberData.length).padStart(6)}                              ║`);
  console.log(`║  Output: ${outputPath.slice(-45).padEnd(45)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
