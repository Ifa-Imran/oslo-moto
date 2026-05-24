import { ethers } from "hardhat";

const REFERRAL = "0x0e2b26C5206FADDFcCB55E8Ae640d809954193b0";
const RANK_SYSTEM = "0xda343DcB7B510De141b93039dE76cf766beB7C9A";
const INVESTMENT_ENGINE = "0xA4e80544382FeA239Dc5bE8C872602Ba81c875D5";
const TEST_WALLET = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  console.log("=== Level Income & Rank Qualification Diagnostic ===\n");

  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const rankSystem = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);

  try {
    // 1. Check referral rewards for test wallet
    console.log("1. REFERRAL REWARDS CHECK");
    console.log("   Checking test wallet referral rewards...");
    const rewards = await referral.referralRewards(TEST_WALLET);
    console.log(`   Referral Rewards: ${ethers.formatEther(rewards)} BUSD`);

    const userInfo = await referral.userInfo(TEST_WALLET);
    console.log(`   Total Earned (Lifetime): ${ethers.formatEther(userInfo.totalEarned)} BUSD`);
    console.log(`   Unlocked Levels: ${userInfo.unlockedLevels}`);
    console.log(`   Direct Referrals Count: ${userInfo.directReferrals ? userInfo.directReferrals.length : 0}`);

    // 2. Check if referral commission is being distributed
    console.log("\n2. REFERRAL COMMISSION DISTRIBUTION");
    console.log("   Checking if investment engine calls distributeReferralCommission...");
    
    // Get recent deposits to see if anyone has claimed rewards
    const depositCount = await investmentEngine.getDepositCount(TEST_WALLET);
    console.log(`   Test wallet deposit count: ${depositCount}`);

    // 3. Check rank system turnover
    console.log("\n3. RANK SYSTEM TURNOVER CHECK");
    const currentWeek = await rankSystem.getCurrentWeekId();
    console.log(`   Current Week ID: ${currentWeek}`);

    const weeklyTurnover = await rankSystem.getWeeklyTurnover(TEST_WALLET, currentWeek);
    console.log(`   Weekly Turnover: ${ethers.formatEther(weeklyTurnover)} BUSD`);

    // 4. Check leg turnover
    console.log("\n4. LEG BREAKDOWN CHECK");
    const directs = userInfo.directReferrals || [];
    if (directs.length > 0) {
      console.log(`   Found ${directs.length} direct referral(s):`);
      for (let i = 0; i < directs.length; i++) {
        const legAddr = directs[i];
        const legTurnover = await rankSystem.getLegTurnover(TEST_WALLET, currentWeek, legAddr);
        console.log(`   Leg ${i + 1}: ${legAddr}`);
        console.log(`     Turnover: ${ethers.formatEther(legTurnover)} BUSD`);
      }
    } else {
      console.log("   No direct referrals found - no legs to display");
    }

    // 5. Check rank qualification
    console.log("\n5. RANK QUALIFICATION CHECK");
    const isQualified = await rankSystem.isRankQualified(TEST_WALLET);
    console.log(`   Is Rank Qualified: ${isQualified}`);

    const currentRank = await rankSystem.getCurrentRank(TEST_WALLET);
    console.log(`   Current Rank: ${currentRank}`);

    // 6. Check total registered to understand network size
    console.log("\n6. NETWORK OVERVIEW");
    const totalRegistered = await referral.totalRegistered();
    console.log(`   Total Registered Users: ${totalRegistered}`);

    const bonusPoolBalance = await rankSystem.bonusPoolBalance();
    console.log(`   Rank Bonus Pool Balance: ${ethers.formatEther(bonusPoolBalance)} BUSD`);

    console.log("\n✅ Diagnostic complete!");
    console.log("\n⚠️  NOTES:");
    console.log("   - Referral commissions are paid on PROFIT portion of claims, not deposits");
    console.log("   - Users must CLAIM rewards for referral commissions to be distributed");
    console.log("   - Leg turnover is recorded when deposits are made, not when rewards are claimed");
    console.log("   - Rank qualification requires 40/60 leg ratio check");

  } catch (error: any) {
    console.log("\n❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
