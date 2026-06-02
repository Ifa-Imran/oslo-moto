import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * OSLO Protocol — Final Comprehensive Testnet Snapshot
 * 
 * Captures ALL on-chain data from every contract:
 *   - Referral tree (users, referrers, levels, directs, earnings, level income)
 *   - Investment Engine (deposits, user info, totals)
 *   - Rank System (ranks, weekly turnover, bonuses)
 *   - DAO (members, monthly turnover)
 *   - DEX (reserves, price)
 *   - Token balances (OSLO, USDT for key addresses)
 *   - Treasury state
 * 
 * Run:
 *   npx hardhat run scripts/final-snapshot.ts --network bscTestnet
 */

// Current testnet addresses
const ADDRESSES = {
  USDT: "0xEbe8cABE6452135e21ede21F648f6d3965a0c915",
  OSLOToken: "0x8E771d9D24fd9E6F4298Aae077B0Dff2b3dEd673",
  OSLODEX: "0xf2023E02030700ed8ce6ed5230B09E1edC3F5418",
  OSLOTreasury: "0x30CE769377f9B66949e2B2f55f234214d52963EB",
  OSLOLiquidityManager: "0x444513eEd158C9327a57e594D50c9741b7766C97",
  OSLODAO: "0x4e70523C0F7f714318bBB7De4dFB48d75F9eE477",
  OSLORankSystem: "0x48DEEDdF789f7ce656ce045B6a308F73D3f5C537",
  OSLOReferral: "0x5F79EDebcd005e34B3CafA997c2eC83132977CFf",
  OSLOInvestmentEngine: "0xe44eb2Dd7129571AC514E646302e829B8738528d",
};

const KNOWN_ROOTS = [
  "0x47f8160e3C854b4b4679579b99726E5E81736B7f", // deployer
  "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // second root user
];

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   OSLO Protocol — Final Testnet Snapshot             ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Signer: ${deployer.address}\n`);

  // Load contracts
  const referral = await ethers.getContractAt("OSLOReferral", ADDRESSES.OSLOReferral);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", ADDRESSES.OSLOInvestmentEngine);
  const rankSystem = await ethers.getContractAt("OSLORankSystem", ADDRESSES.OSLORankSystem);
  const dao = await ethers.getContractAt("OSLODAO", ADDRESSES.OSLODAO);
  const dex = await ethers.getContractAt("OSLODEX", ADDRESSES.OSLODEX);
  const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES.USDT);
  const osloToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ADDRESSES.OSLOToken);

  // ═══════════════════════════════════════════════════════════════════
  // 1. REFERRAL TREE — BFS Walk
  // ═══════════════════════════════════════════════════════════════════
  console.log("─── 1. Referral Tree ───────────────────────────────────");
  const totalRegistered = Number(await referral.totalRegistered());
  const totalCommissionsPaid = ethers.formatEther(await referral.totalCommissionsPaid());
  const totalFeesCollected = ethers.formatEther(await referral.totalFeesCollected());
  console.log(`  Total Registered: ${totalRegistered}`);
  console.log(`  Total Commissions Paid: $${totalCommissionsPaid}`);
  console.log(`  Total Fees Collected: $${totalFeesCollected}`);

  interface UserSnapshot {
    address: string;
    referrer: string;
    unlockedLevels: number;
    totalEarned: string;
    directReferralCount: number;
    directReferrals: string[];
    referralRewards: string; // pending unclaimed
    levelIncome: string[];   // 20 levels
    // Investment Engine data
    totalActiveDeposit: string;
    depositCount: number;
    totalCombinedEarnings: string;
    // Rank data
    currentRank: number;
    // DAO
    isDAOMember: boolean;
  }

  const usersData: UserSnapshot[] = [];
  const visited = new Set<string>();
  const queue: string[] = [...KNOWN_ROOTS];

  while (queue.length > 0) {
    const addr = queue.shift()!;
    if (visited.has(addr.toLowerCase())) continue;

    try {
      const info = await referral.userInfo(addr);
      if (!info.registered) continue;

      visited.add(addr.toLowerCase());

      // Direct referrals
      let directs: string[] = [];
      try {
        directs = await referral.getDirectReferrals(addr);
      } catch {}

      // Referral rewards (pending)
      let rewards = "0.0";
      try {
        rewards = ethers.formatEther(await referral.referralRewards(addr));
      } catch {}

      // Level income (levels 1-20)
      let levelIncomeArr: string[] = [];
      try {
        const allLevelIncome = await referral.getAllLevelIncome(addr);
        levelIncomeArr = allLevelIncome.map((v: bigint) => ethers.formatEther(v));
      } catch {
        // Fallback: read individually
        for (let lvl = 1; lvl <= 20; lvl++) {
          try {
            const li = await referral.levelIncome(addr, lvl);
            levelIncomeArr.push(ethers.formatEther(li));
          } catch {
            levelIncomeArr.push("0.0");
          }
        }
      }

      // Investment Engine user info
      let totalActiveDeposit = "0.0";
      let depositCount = 0;
      let totalCombinedEarnings = "0.0";
      try {
        const userIE = await ie.users(addr);
        totalActiveDeposit = ethers.formatEther(userIE.totalActiveDeposit);
        depositCount = Number(userIE.depositCount);
        totalCombinedEarnings = ethers.formatEther(userIE.totalCombinedEarnings);
      } catch {}

      // Rank
      let currentRank = 0;
      try {
        currentRank = Number(await rankSystem.getCurrentRank(addr));
      } catch {}

      // DAO
      let isDAOMember = false;
      try {
        isDAOMember = await dao.isDAOMember(addr);
      } catch {}

      usersData.push({
        address: addr,
        referrer: info.referrer,
        unlockedLevels: Number(info.unlockedLevels),
        totalEarned: ethers.formatEther(info.totalEarned),
        directReferralCount: directs.length,
        directReferrals: directs.map((d: string) => d),
        referralRewards: rewards,
        levelIncome: levelIncomeArr,
        totalActiveDeposit,
        depositCount,
        totalCombinedEarnings,
        currentRank,
        isDAOMember,
      });

      console.log(`  [${usersData.length}/${totalRegistered}] ${addr} | Deps: ${depositCount} | Active: $${totalActiveDeposit} | Rank: ${currentRank} | DAO: ${isDAOMember}`);

      // Queue children
      for (const child of directs) {
        if (!visited.has(child.toLowerCase())) {
          queue.push(child);
        }
      }
    } catch (err: any) {
      console.error(`  Error reading ${addr}: ${err.message?.slice(0, 80)}`);
    }
  }

  console.log(`\n  Total users found: ${usersData.length}`);

  // ═══════════════════════════════════════════════════════════════════
  // 2. ALL DEPOSITS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 2. All Deposits ────────────────────────────────────");

  interface DepositSnapshot {
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
  }

  const allDeposits: DepositSnapshot[] = [];

  for (const user of usersData) {
    if (user.depositCount === 0) continue;

    for (let i = 0; i < user.depositCount; i++) {
      try {
        const dep = await ie.userDeposits(user.address, i);
        allDeposits.push({
          owner: user.address,
          index: i,
          amount: ethers.formatEther(dep.amount),
          tier: Number(dep.tier),
          dailyRate: Number(dep.dailyRate),
          depositTime: Number(dep.depositTime),
          lastClaimTime: Number(dep.lastClaimTime),
          totalClaimed: ethers.formatEther(dep.totalClaimed),
          maxReturn: ethers.formatEther(dep.maxReturn),
          active: dep.active,
        });
      } catch (err: any) {
        console.error(`  Error deposit ${user.address}[${i}]: ${err.message?.slice(0, 60)}`);
      }
    }
    console.log(`  ${user.address}: ${user.depositCount} deposit(s) read`);
  }

  const activeDeposits = allDeposits.filter(d => d.active);
  const totalDepositValue = allDeposits.filter(d => d.active).reduce((sum, d) => sum + parseFloat(d.amount), 0);
  console.log(`  Total deposits: ${allDeposits.length} (${activeDeposits.length} active, $${totalDepositValue.toFixed(2)} value)`);

  // ═══════════════════════════════════════════════════════════════════
  // 3. INVESTMENT ENGINE GLOBALS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 3. Investment Engine Globals ────────────────────────");
  const ieTotalDeposited = ethers.formatEther(await ie.totalDeposited());
  const ieTotalWithdrawn = ethers.formatEther(await ie.totalWithdrawn());
  const ieTotalRewardsPaid = ethers.formatEther(await ie.totalRewardsPaid());
  const ieDepositsPaused = await ie.depositsPaused();
  console.log(`  totalDeposited: $${ieTotalDeposited}`);
  console.log(`  totalWithdrawn: $${ieTotalWithdrawn}`);
  console.log(`  totalRewardsPaid: $${ieTotalRewardsPaid}`);
  console.log(`  depositsPaused: ${ieDepositsPaused}`);

  // ═══════════════════════════════════════════════════════════════════
  // 4. DEX STATE
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 4. DEX State ───────────────────────────────────────");
  let dexPrice = "0";
  let dexUSDTReserve = "0";
  let dexOSLOReserve = "0";
  try {
    dexPrice = ethers.formatEther(await dex.getPrice());
    const reserves = await dex.getReserves();
    dexUSDTReserve = ethers.formatEther(reserves._usdtRes || reserves[0]);
    dexOSLOReserve = ethers.formatEther(reserves._osloRes || reserves[1]);
  } catch (err: any) {
    console.error(`  DEX error: ${err.message?.slice(0, 60)}`);
  }
  console.log(`  Price: $${dexPrice}/OSLO`);
  console.log(`  USDT Reserve: $${dexUSDTReserve}`);
  console.log(`  OSLO Reserve: ${dexOSLOReserve}`);

  // ═══════════════════════════════════════════════════════════════════
  // 5. DAO STATE
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 5. DAO State ───────────────────────────────────────");
  let daoMembers: string[] = [];
  let daoMemberCount = 0;
  try {
    daoMembers = await dao.getAllDAOMembers();
    daoMemberCount = daoMembers.length;
  } catch {}
  console.log(`  DAO Members: ${daoMemberCount}`);
  if (daoMemberCount > 0) {
    for (const m of daoMembers) {
      console.log(`    - ${m}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. RANK SYSTEM — Current week data for all users with rank > 0
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 6. Rank System ─────────────────────────────────────");
  let currentWeekId = 0;
  try {
    currentWeekId = Number(await rankSystem.getCurrentWeekId());
  } catch {}
  console.log(`  Current Week ID: ${currentWeekId}`);

  interface RankSnapshot {
    address: string;
    rank: number;
    weeklyTurnover: string;
    pendingBonus: string;
  }

  const rankData: RankSnapshot[] = [];
  for (const user of usersData) {
    if (user.currentRank > 0) {
      let weeklyTurnover = "0.0";
      let pendingBonus = "0.0";
      try {
        weeklyTurnover = ethers.formatEther(await rankSystem.getWeeklyTurnover(user.address, currentWeekId));
      } catch {}
      try {
        pendingBonus = ethers.formatEther(await rankSystem.getPendingBonus(user.address));
      } catch {}
      rankData.push({
        address: user.address,
        rank: user.currentRank,
        weeklyTurnover,
        pendingBonus,
      });
      console.log(`  ${user.address}: Rank ${user.currentRank} | Turnover: $${weeklyTurnover} | Bonus: $${pendingBonus}`);
    }
  }
  if (rankData.length === 0) console.log("  No ranked users.");

  // ═══════════════════════════════════════════════════════════════════
  // 7. KEY TOKEN BALANCES
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 7. Key Token Balances ──────────────────────────────");

  interface BalanceSnapshot {
    label: string;
    address: string;
    usdt: string;
    oslo: string;
  }

  const balanceTargets = [
    { label: "InvestmentEngine", address: ADDRESSES.OSLOInvestmentEngine },
    { label: "OSLODEX", address: ADDRESSES.OSLODEX },
    { label: "Treasury", address: ADDRESSES.OSLOTreasury },
    { label: "LiquidityManager", address: ADDRESSES.OSLOLiquidityManager },
    { label: "RankSystem", address: ADDRESSES.OSLORankSystem },
    { label: "DAO", address: ADDRESSES.OSLODAO },
    { label: "Referral", address: ADDRESSES.OSLOReferral },
    { label: "Deployer", address: deployer.address },
  ];

  const balances: BalanceSnapshot[] = [];
  for (const target of balanceTargets) {
    const usdtBal = ethers.formatEther(await usdt.balanceOf(target.address));
    const osloBal = ethers.formatEther(await osloToken.balanceOf(target.address));
    balances.push({ label: target.label, address: target.address, usdt: usdtBal, oslo: osloBal });
    console.log(`  ${target.label}: $${usdtBal} USDT | ${osloBal} OSLO`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 8. TOPOLOGICAL SORT (parents before children)
  // ═══════════════════════════════════════════════════════════════════
  const sorted: UserSnapshot[] = [];
  const added = new Set<string>();

  // Root users first
  for (const u of usersData) {
    if (u.referrer === ethers.ZeroAddress) {
      sorted.push(u);
      added.add(u.address.toLowerCase());
    }
  }
  // Iterative BFS
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of usersData) {
      if (added.has(u.address.toLowerCase())) continue;
      if (added.has(u.referrer.toLowerCase())) {
        sorted.push(u);
        added.add(u.address.toLowerCase());
        changed = true;
      }
    }
  }
  // Remaining (should be none)
  for (const u of usersData) {
    if (!added.has(u.address.toLowerCase())) {
      sorted.push(u);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BUILD FINAL SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════
  const snapshot = {
    meta: {
      network: "bscTestnet",
      chainId: 97,
      snapshotTime: new Date().toISOString(),
      snapshotBlock: await ethers.provider.getBlockNumber(),
      contracts: ADDRESSES,
    },
    referral: {
      totalRegistered,
      totalCommissionsPaid,
      totalFeesCollected,
    },
    investmentEngine: {
      totalDeposited: ieTotalDeposited,
      totalWithdrawn: ieTotalWithdrawn,
      totalRewardsPaid: ieTotalRewardsPaid,
      depositsPaused: ieDepositsPaused,
      totalActiveDeposits: activeDeposits.length,
      totalActiveValue: totalDepositValue.toFixed(2),
    },
    dex: {
      price: dexPrice,
      usdtReserve: dexUSDTReserve,
      osloReserve: dexOSLOReserve,
    },
    dao: {
      memberCount: daoMemberCount,
      members: daoMembers,
    },
    rankSystem: {
      currentWeekId,
      rankedUsers: rankData,
    },
    balances,
    users: sorted,
    deposits: allDeposits,
  };

  // Write output
  const outputPath = path.join(__dirname, "..", "data", "testnet-final-snapshot.json");
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║   SNAPSHOT COMPLETE                                   ║");
  console.log("╚═══════════════════════════════════════════════════════╝");
  console.log(`  Users: ${sorted.length}`);
  console.log(`  Deposits: ${allDeposits.length} (${activeDeposits.length} active)`);
  console.log(`  Active Value: $${totalDepositValue.toFixed(2)}`);
  console.log(`  DAO Members: ${daoMemberCount}`);
  console.log(`  Ranked Users: ${rankData.length}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
