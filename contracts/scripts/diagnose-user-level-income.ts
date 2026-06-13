import { ethers } from "hardhat";

// Mainnet addresses (V2 - original deployment)
const INVESTMENT_ENGINE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
const REFERRAL = "0xCF3F7B63b952Bef316308642494c51EBD8Cc59C8";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

// Target address to diagnose
const TARGET_USER = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Level Income Deep Diagnosis ===\n");
  console.log("Target User: %s\n", TARGET_USER);

  // ─── Contract ABIs ───
  const referralAbi = [
    "function isRegistered(address) view returns (bool)",
    "function userInfo(address) view returns (tuple(address referrer, uint256 unlockedLevels, uint256 totalEarned, bool registered))",
    "function getReferrer(address) view returns (address)",
    "function getDirectReferrals(address) view returns (address[])",
    "function getUnlockedLevels(address) view returns (uint256)",
    "function getQualifiedDirectsCount(address) view returns (uint256)",
    "function getTeamSize(address) view returns (uint256)",
    "function referralRewards(address) view returns (uint256)",
    "function levelIncome(address user, uint256 level) view returns (uint256)",
    "function getAllLevelIncome(address user) view returns (uint256[])",
    "function totalRegistered() view returns (uint256)",
    "function totalCommissionsPaid() view returns (uint256)",
    "function investmentEngine() view returns (address)",
  ];

  const ieAbi = [
    "function deposits(address user) view returns (tuple(uint256 amount, uint256 timestamp, uint256 dailyYield, uint256 totalEarned, bool active))",
    "function getDepositCount(address user) view returns (uint256)",
    "function getActiveDeposit(address user) view returns (uint256)",
    "function getCombinedEarnings(address user) view returns (uint256)",
    "function referral() view returns (address)",
  ];

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
  ];

  const referral = new ethers.Contract(REFERRAL, referralAbi, deployer);
  const ie = new ethers.Contract(INVESTMENT_ENGINE, ieAbi, deployer);
  const usdt = new ethers.Contract(USDT, erc20Abi, deployer);

  // ─── 1. Target User Basic Info ───
  console.log("═══════════════════════════════════════════════");
  console.log("1. TARGET USER BASIC INFO");
  console.log("═══════════════════════════════════════════════");
  
  const isRegistered = await referral.isRegistered(TARGET_USER);
  console.log("Registered: %s", isRegistered);
  
  const userInfo = await referral.userInfo(TARGET_USER);
  console.log("Referrer: %s", userInfo.referrer);
  console.log("Unlocked Levels: %s", userInfo.unlockedLevels.toString());
  console.log("Total Earned (all time): %s USDT", ethers.formatEther(userInfo.totalEarned));
  console.log("Registered: %s", userInfo.registered);

  const referralRewards = await referral.referralRewards(TARGET_USER);
  console.log("\nPending Referral Rewards: %s USDT", ethers.formatEther(referralRewards));

  // ─── 2. Direct Referrals Analysis ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("2. DIRECT REFERRALS ANALYSIS");
  console.log("═══════════════════════════════════════════════");
  
  const directs = await referral.getDirectReferrals(TARGET_USER);
  console.log("Direct Referrals Count: %d", directs.length);
  
  if (directs.length > 0) {
    console.log("\nDirect Referral Addresses:");
    for (let i = 0; i < directs.length; i++) {
      const direct = directs[i];
      console.log("  [%d] %s", i + 1, direct);
      
      // Check if direct has active deposit
      try {
        const directDeposit = await ie.getActiveDeposit(direct);
        console.log("      Active Deposit: %s USDT", ethers.formatEther(directDeposit));
      } catch (e: any) {
        console.log("      Active Deposit: ERROR - %s", e.message.slice(0, 80));
      }
      
      // Check if direct is registered
      try {
        const directRegistered = await referral.isRegistered(direct);
        console.log("      Registered: %s", directRegistered);
      } catch (e: any) {
        console.log("      Registered: ERROR");
      }
    }
  } else {
    console.log("\n⚠ NO DIRECT REFERRALS FOUND");
  }

  const qualifiedDirects = await referral.getQualifiedDirectsCount(TARGET_USER);
  console.log("\nQualified Directs: %s", qualifiedDirects.toString());

  // ─── 3. Level Income Breakdown ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("3. LEVEL INCOME BREAKDOWN (ALL 20 LEVELS)");
  console.log("═══════════════════════════════════════════════");
  
  // Try getAllLevelIncome, but fallback to manual level-by-level check
  let allLevelIncome: bigint[] = [];
  
  try {
    allLevelIncome = await referral.getAllLevelIncome(TARGET_USER);
    console.log("\n✓ getAllLevelIncome succeeded\n");
  } catch (e: any) {
    console.log("⚠ getAllLevelIncome failed: %s", e.message.slice(0, 100));
    console.log("\nFalling back to manual level-by-level query...\n");
    
    // Manual query each level
    for (let i = 0; i < 20; i++) {
      try {
        const levelInc = await referral.levelIncome(TARGET_USER, i);
        allLevelIncome.push(levelInc);
      } catch (e: any) {
        allLevelIncome.push(0n);
      }
    }
  }
  
  let totalLevelIncome = 0n;
  
  console.log("Level | Income (USDT) | Has Income?");
  console.log("------|---------------|------------");
  
  for (let i = 0; i < allLevelIncome.length; i++) {
    const levelIncome = allLevelIncome[i];
    const incomeNum = Number(ethers.formatEther(levelIncome));
    totalLevelIncome += levelIncome;
    
    if (levelIncome > 0n) {
      console.log("L%-5d | %13.6f | ✓ YES", i + 1, incomeNum);
    }
  }
  
  console.log("------|---------------|------------");
  console.log("TOTAL | %13.6f |", Number(ethers.formatEther(totalLevelIncome)));
  
  console.log("\n⚠ Dashboard shows: $131 USDT");
  console.log("⚠ Contract shows: $%s USDT", ethers.formatEther(totalLevelIncome));

  // ─── 4. Detailed Analysis of Levels with Income ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("4. DETAILED LEVEL INCOME ANALYSIS");
  console.log("═══════════════════════════════════════════════");
  
  const levelsWithIncome: number[] = [];
  for (let i = 0; i < allLevelIncome.length; i++) {
    if (allLevelIncome[i] > 0n) {
      levelsWithIncome.push(i + 1);
    }
  }
  
  if (levelsWithIncome.length > 0) {
    console.log("\nLevels with income: %s", levelsWithIncome.join(", "));
    
    // For each level with income, trace the referral chain
    for (const level of levelsWithIncome) {
      console.log("\n── Level %d Analysis ──", level);
      
      // Walk up the referral tree to find who at this level
      let currentAddress = TARGET_USER;
      for (let i = 0; i < level; i++) {
        try {
          const referrer = await referral.getReferrer(currentAddress);
          if (referrer === "0x0000000000000000000000000000000000000000") {
            console.log("  Chain broken at step %d (root reached)", i + 1);
            break;
          }
          currentAddress = referrer;
          
          if (i === level - 1) {
            // This is the user at the target level
            console.log("  User at Level %d: %s", level, currentAddress);
            
            // Check their deposit
            try {
              const deposit = await ie.getActiveDeposit(currentAddress);
              console.log("  Their Active Deposit: %s USDT", ethers.formatEther(deposit));
            } catch (e: any) {
              console.log("  Their Active Deposit: ERROR - %s", e.message.slice(0, 80));
            }
            
            // Check if they're registered
            const reg = await referral.isRegistered(currentAddress);
            console.log("  Registered: %s", reg);
            
          }
        } catch (e: any) {
          console.log("  Error at step %d: %s", i + 1, e.message.slice(0, 80));
          break;
        }
      }
    }
  } else {
    console.log("\n⚠ NO LEVELS SHOW INCOME IN CONTRACT");
    console.log("This suggests the dashboard may be reading stale data or there's a frontend bug.");
  }

  // ─── 5. Team Size vs Direct Referrals ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("5. TEAM STRUCTURE");
  console.log("═══════════════════════════════════════════════");
  
  const teamSize = await referral.getTeamSize(TARGET_USER);
  console.log("Team Size (total downline): %s", teamSize.toString());
  console.log("Direct Referrals: %d", directs.length);
  console.log("Indirect Team: %s", (Number(teamSize) - directs.length).toString());

  // ─── 6. Investment Engine State ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("6. INVESTMENT ENGINE STATE");
  console.log("═══════════════════════════════════════════════");
  
  try {
    const depositCount = await ie.getDepositCount(TARGET_USER);
    console.log("Deposit Count: %s", depositCount.toString());
    
    const activeDeposit = await ie.getActiveDeposit(TARGET_USER);
    console.log("Active Deposit: %s USDT", ethers.formatEther(activeDeposit));
    
    const combinedEarnings = await ie.getCombinedEarnings(TARGET_USER);
    console.log("Combined Earnings: %s USDT", ethers.formatEther(combinedEarnings));
  } catch (e: any) {
    console.log("Error reading IE data: %s", e.message.slice(0, 100));
  }

  // ─── 7. USDT Balance ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("7. USDT BALANCE");
  console.log("═══════════════════════════════════════════════");
  
  const usdtBalance = await usdt.balanceOf(TARGET_USER);
  console.log("USDT Balance: %s USDT", ethers.formatEther(usdtBalance));

  // ─── 8. Cross-Contract Configuration ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("8. CROSS-CONTRACT CONFIGURATION");
  console.log("═══════════════════════════════════════════════");
  
  const ieInReferral = await referral.investmentEngine();
  console.log("Referral.investmentEngine: %s", ieInReferral);
  console.log("Expected IE: %s", INVESTMENT_ENGINE);
  console.log("Match: %s", ieInReferral.toLowerCase() === INVESTMENT_ENGINE.toLowerCase() ? "✓ YES" : "✗ NO");

  const refInIE = await ie.referral();
  console.log("\nIE.referral: %s", refInIE);
  console.log("Expected Referral: %s", REFERRAL);
  console.log("Match: %s", refInIE.toLowerCase() === REFERRAL.toLowerCase() ? "✓ YES" : "✗ NO");

  // ─── 9. Summary & Diagnosis ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("9. DIAGNOSIS SUMMARY");
  console.log("═══════════════════════════════════════════════");
  
  console.log("\nTarget User: %s", TARGET_USER);
  console.log("Has Direct Referrals: %s", directs.length > 0 ? "YES" : "NO");
  console.log("Direct Count: %d", directs.length);
  console.log("Team Size: %s", teamSize.toString());
  console.log("Total Level Income: %s USDT", ethers.formatEther(totalLevelIncome));
  console.log("Dashboard Shows: $131 USDT");
  
  console.log("\n── Possible Causes ──");
  
  if (totalLevelIncome > 0n && directs.length === 0) {
    console.log("\n⚠ ANOMALY DETECTED:");
    console.log("  - User has level income but NO direct referrals");
    console.log("  - This should not be possible under normal circumstances");
    console.log("\nPossible explanations:");
    console.log("  1. User HAD direct referrals who later exited (data persists)");
    console.log("  2. Frontend is reading stale/cached data");
    console.log("  3. Bug in level income calculation or tracking");
    console.log("  4. User is receiving income from indirect team (levels 2+)");
  }
  
  if (totalLevelIncome === 0n) {
    console.log("\n⚠ FRONTEND BUG DETECTED:");
    console.log("  - Contract shows ZERO level income");
    console.log("  - Dashboard shows $131 USDT");
    console.log("  - This is a frontend data reading/display issue");
    console.log("\nCheck:");
    console.log("  - Frontend getAllLevelIncome hook implementation");
    console.log("  - Caching or stale data in frontend");
    console.log("  - Browser dev tools → Network tab → verify RPC calls");
  }
  
  if (levelsWithIncome.length > 0) {
    console.log("\nℹ LEVEL INCOME SOURCE:");
    console.log("  - Income exists on levels: %s", levelsWithIncome.join(", "));
    console.log("  - Check the detailed analysis above for which users generated this income");
    console.log("  - Verify those users have/had active deposits");
  }

  console.log("\n=== Diagnosis Complete ===\n");
}

main().catch(console.error);
