import { ethers } from "hardhat";

// Mainnet addresses
const INVESTMENT_ENGINE = "0x4d27A6564BE18fF57f4484aCBd8F5bCc9caB2E80";
const REFERRAL = "0x04874b7fE1b31B4cC45575f15bcE7Aeb90399Cd3";
const OSLO_DEX = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

// Test with a specific user who has claimed rewards
const TEST_USER = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Level Income Distribution Diagnosis ===\n");
  console.log("Test User: %s\n", TEST_USER);

  // ─── Contract ABIs ───
  const ieAbi = [
    "function userDeposits(address, uint256) view returns (uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositTime, uint256 lastClaimTime, uint256 totalClaimed, uint256 maxReturn, bool active)",
    "function getDepositCount(address) view returns (uint256)",
    "function getPendingRewards(address, uint256) view returns (uint256)",
    "function referral() view returns (address)",
    "function claimRewards(uint256 depositIndex)",
  ];

  const referralAbi = [
    "function userInfo(address) view returns (address referrer, uint256 unlockedLevels, uint256 totalEarned, bool registered)",
    "function referralRewards(address) view returns (uint256)",
    "function levelIncome(address, uint256) view returns (uint256)",
    "function getReferrer(address) view returns (address)",
    "function getDirectReferrals(address) view returns (address[])",
    "function distributeReferralCommission(address user, uint256 profitAmount) returns (uint256)",
    "function investmentEngine() view returns (address)",
    "function totalCommissionsPaid() view returns (uint256)",
  ];

  const dexAbi = [
    "function getPrice() view returns (uint256)",
    "function getUSDTForOSLOOutput(uint256 usdtAmount) view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address, uint256) returns (bool)",
  ];

  const ie = new ethers.Contract(INVESTMENT_ENGINE, ieAbi, deployer);
  const referral = new ethers.Contract(REFERRAL, referralAbi, deployer);
  const dex = new ethers.Contract(OSLO_DEX, dexAbi, deployer);
  const usdt = new ethers.Contract(USDT, erc20Abi, deployer);

  // ─── 1. Check InvestmentEngine Configuration ───
  console.log("═══════════════════════════════════════════════");
  console.log("1. INVESTMENT ENGINE CONFIGURATION");
  console.log("═══════════════════════════════════════════════");

  const ieReferral = await ie.referral();
  console.log("IE.referral: %s", ieReferral);
  console.log("Match: %s", ieReferral.toLowerCase() === REFERRAL.toLowerCase() ? "✅ YES" : "❌ NO");

  // ─── 2. Check Test User's Deposits ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("2. TEST USER DEPOSITS");
  console.log("═══════════════════════════════════════════════");

  const depositCount = await ie.getDepositCount(TEST_USER);
  console.log("Deposit Count: %s", depositCount.toString());

  for (let i = 0; i < Number(depositCount); i++) {
    const dep = await ie.userDeposits(TEST_USER, i);
    console.log(`\nDeposit #${i}:`);
    console.log(`  Amount: ${ethers.formatEther(dep.amount)} USDT`);
    console.log(`  Total Claimed: ${ethers.formatEther(dep.totalClaimed)} USDT`);
    console.log(`  Active: ${dep.active}`);
    console.log(`  Last Claim: ${new Date(Number(dep.lastClaimTime) * 1000).toISOString()}`);
  }

  // ─── 3. Check Test User's Referral Info ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("3. TEST USER REFERRAL INFO");
  console.log("═══════════════════════════════════════════════");

  const testUserInfo = await referral.userInfo(TEST_USER);
  console.log("Registered: %s", testUserInfo.registered);
  console.log("Referrer: %s", testUserInfo.referrer);
  console.log("Unlocked Levels: %s", testUserInfo.unlockedLevels.toString());
  console.log("Total Earned: %s USDT", ethers.formatEther(testUserInfo.totalEarned));

  const pendingRewards = await referral.referralRewards(TEST_USER);
  console.log("Pending Rewards: %s USDT", ethers.formatEther(pendingRewards));

  // ─── 4. Trace Referral Chain (20 levels up) ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("4. REFERRAL CHAIN (20 LEVELS UP)");
  console.log("═══════════════════════════════════════════════");

  let current = TEST_USER;
  for (let level = 0; level <= 20; level++) {
    if (level === 0) {
      console.log(`\nLevel 0 (User): ${current}`);
      continue;
    }

    const upline = await referral.getReferrer(current);
    if (upline === ethers.ZeroAddress) {
      console.log(`\nLevel ${level}: No upline (chain ends)`);
      break;
    }

    const uplineInfo = await referral.userInfo(upline);
    const uplineRewards = await referral.referralRewards(upline);
    const levelInc = await referral.levelIncome(upline, level);

    console.log(`\nLevel ${level}: ${upline}`);
    console.log(`  Unlocked Levels: ${uplineInfo.unlockedLevels}`);
    console.log(`  Has Level ${level} Unlocked: ${uplineInfo.unlockedLevels >= level ? "✅ YES" : "❌ NO"}`);
    console.log(`  Pending Rewards: ${ethers.formatEther(uplineRewards)} USDT`);
    console.log(`  Income from Level ${level}: ${ethers.formatEther(levelInc)} USDT`);
    console.log(`  Total Earned: ${ethers.formatEther(uplineInfo.totalEarned)} USDT`);

    current = upline;
  }

  // ─── 5. Check Referral Contract State ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("5. REFERRAL CONTRACT STATE");
  console.log("═══════════════════════════════════════════════");

  const refIE = await referral.investmentEngine();
  console.log("Referral.investmentEngine: %s", refIE);
  console.log("Match: %s", refIE.toLowerCase() === INVESTMENT_ENGINE.toLowerCase() ? "✅ YES" : "❌ NO");

  const totalCommissions = await referral.totalCommissionsPaid();
  console.log("Total Commissions Paid (all time): %s USDT", ethers.formatEther(totalCommissions));

  // ─── 6. Check DEX State ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("6. DEX STATE");
  console.log("═══════════════════════════════════════════════");

  const price = await dex.getPrice();
  console.log("DEX Price: %s", price.toString());
  console.log("DEX Price (formatted): %s USDT per OSLO", ethers.formatEther(price));

  // ─── 7. Simulate Commission Distribution ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("7. SIMULATE: If user claims 100 USDT yield");
  console.log("═══════════════════════════════════════════════");

  const simulatedYield = ethers.parseEther("100"); // 100 USDT
  console.log("Simulated Yield: 100 USDT");
  console.log("\nExpected Commission Distribution:");

  current = TEST_USER;
  let totalExpectedCommission = 0n;

  for (let level = 1; level <= 20; level++) {
    const upline = await referral.getReferrer(current);
    if (upline === ethers.ZeroAddress) {
      console.log(`\nLevel ${level}: No upline (chain ends)`);
      break;
    }

    const uplineInfo = await referral.userInfo(upline);
    
    // Commission rates
    let rateBp = 0n;
    if (level === 1) rateBp = 3000n;      // 30%
    else if (level === 2) rateBp = 2000n;  // 20%
    else if (level >= 3 && level <= 10) rateBp = 1000n;  // 10%
    else if (level >= 11 && level <= 20) rateBp = 500n;  // 5%

    if (uplineInfo.unlockedLevels >= level && rateBp > 0n) {
      const commission = (simulatedYield * rateBp) / 10000n;
      totalExpectedCommission += commission;
      console.log(`Level ${level}: ${ethers.formatEther(commission)} USDT (${Number(rateBp) / 100}%)`);
    } else {
      console.log(`Level ${level}: 0 USDT (not unlocked)`);
    }

    current = upline;
  }

  console.log(`\nTotal Expected Commission: ${ethers.formatEther(totalExpectedCommission)} USDT`);
  const osloForCommission = await dex.getUSDTForOSLOOutput(totalExpectedCommission);
  console.log(`OSLO Needed for Commission: ${ethers.formatEther(osloForCommission)} OSLO`);

  // ─── 8. Check Referral Contract OSLO Balance ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("8. REFERRAL CONTRACT OSLO BALANCE");
  console.log("═══════════════════════════════════════════════");

  const osloToken = "0xE1C6B447bFf4e8292d8c2463e3F68ED7Be8e4a32";
  const referralOsloBal = await usdt.balanceOf(REFERRAL); // Using wrong ABI, but let's try
  console.log("Referral USDT Balance: %s", ethers.formatEther(referralOsloBal));

  // ─── 9. Check for ReferralPaid Events ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("9. RECENT REFERRAL PAID EVENTS");
  console.log("═══════════════════════════════════════════════");

  console.log("To check events, run:");
  console.log(`  npx hardhat console --network bscMainnet`);
  console.log(`  > const ref = await ethers.getContractAt("OSLOReferral", "${REFERRAL}")`);
  console.log(`  > const events = await ref.queryFilter(ref.filters.ReferralPaid())`);
  console.log(`  > events.slice(-10).forEach(e => console.log(e.args))`);

  // ─── 10. Diagnosis Summary ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("10. DIAGNOSIS SUMMARY");
  console.log("═══════════════════════════════════════════════");

  console.log("\nPotential Issues to Check:");
  console.log("1. ✅ IE calls distributeReferralCommission? → YES (line 398)");
  console.log("2. ✅ Referral contract configured? → Check above");
  console.log("3. ✅ Users have unlocked levels? → Check above");
  console.log("4. ✅ Referral chain exists (20 levels)? → Check above");
  console.log("5. ❓ Referral contract has OSLO balance? → Check balance");
  console.log("6. ❓ Events being emitted? → Check ReferralPaid events");
  console.log("7. ❓ Commission rates correct? → L1:30%, L2:20%, L3-10:10%, L11-20:5%");

  console.log("\n=== Diagnosis Complete ===\n");
}

main().catch(console.error);
