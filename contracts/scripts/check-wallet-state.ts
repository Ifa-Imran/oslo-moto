import { ethers } from "hardhat";

/**
 * Check a wallet's on-chain state across all OSLO contracts.
 * Usage: npx hardhat run scripts/check-wallet-state.ts --network bscTestnet
 * Set WALLET env var to check a specific wallet, otherwise checks deployer.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const wallet = process.env.WALLET || deployer.address;

  console.log(`\n🔍 Checking on-chain state for: ${wallet}`);
  console.log(`   Network: BSC Testnet (chainId 97)\n`);

  // Load addresses
  const addresses = require("../data/testnet-addresses.json");

  // Connect to contracts
  const referral = await ethers.getContractAt("OSLOReferral", addresses.OSLOReferral);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", addresses.OSLOInvestmentEngine);
  const token = await ethers.getContractAt("OSLOToken", addresses.OSLOToken);
  const usdt = await ethers.getContractAt("MockUSDT", addresses.USDT);
  const rankSystem = await ethers.getContractAt("OSLORankSystem", addresses.OSLORankSystem);

  // ─── Referral Status ───
  console.log("═══════════════════════════════════════════════");
  console.log("📋 REFERRAL CONTRACT");
  console.log("═══════════════════════════════════════════════");

  try {
    // Auto-getter returns: (referrer, unlockedLevels, totalEarned, registered)
    // Note: directReferrals array is skipped by Solidity auto-getter
    const userInfo = await referral.userInfo(wallet);
    const totalRegistered = await referral.totalRegistered();
    
    // Fields by index: [0]=referrer, [1]=unlockedLevels, [2]=totalEarned, [3]=registered
    const referrer = userInfo[0];
    const unlockedLevels = userInfo[1];
    const totalEarned = userInfo[2];
    const registered = userInfo[3];
    
    console.log(`   Registered: ${registered}`);
    console.log(`   Referrer: ${referrer}`);
    console.log(`   Unlocked levels: ${unlockedLevels}`);
    console.log(`   Total earned: ${ethers.formatUnits(totalEarned, 18)} USDT`);
    console.log(`   Total registered (global): ${totalRegistered}`);
    
    // Try to get direct referrals count
    try {
      const directCount = await referral.getDirectReferrals(wallet);
      console.log(`   Direct referrals: ${directCount.length}`);
    } catch {
      console.log(`   Direct referrals: (no getter available)`);
    }
  } catch (e: any) {
    console.log(`   ERROR reading referral: ${e.message}`);
  }

  // ─── Investment Engine ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("📦 INVESTMENT ENGINE");
  console.log("═══════════════════════════════════════════════");

  try {
    // Use getDepositCount and individual deposit access
    const depositCount = await ie.getDepositCount(wallet);
    console.log(`   Deposit count: ${depositCount}`);

    let activeCount = 0;
    let totalDep = BigInt(0);
    const numDeposits = Number(depositCount);
    
    for (let i = 0; i < Math.min(numDeposits, 10); i++) {
      try {
        const d = await ie.userDeposits(wallet, i);
        // Deposit struct: (amount, tier, dailyRate, depositTime, lastClaimTime, totalClaimed, maxReturn, active)
        const active = d[7]; // bool at index 7
        const amount = d[0]; // uint256 at index 0
        if (active) {
          activeCount++;
          totalDep += amount;
        }
        if (i < 3) {
          console.log(`   [${i}] amount=${ethers.formatUnits(amount,18)} tier=${d[1]} active=${active}`);
        }
      } catch (err: any) {
        console.log(`   [${i}] ERROR: ${err.message.slice(0,80)}`);
        break;
      }
    }
    
    console.log(`   Active deposits (first 20): ${activeCount}`);
    console.log(`   Total deposited (first 20): ${ethers.formatUnits(totalDep, 18)} USDT`);
  } catch (e: any) {
    console.log(`   ERROR reading IE: ${e.message}`);
  }

  // ─── Balances ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("💰 BALANCES");
  console.log("═══════════════════════════════════════════════");

  try {
    const osloBalance = await token.balanceOf(wallet);
    const usdtBalance = await usdt.balanceOf(wallet);
    const bnbBalance = await ethers.provider.getBalance(wallet);
    console.log(`   OSLO: ${ethers.formatUnits(osloBalance, 18)}`);
    console.log(`   USDT: ${ethers.formatUnits(usdtBalance, 18)}`);
    console.log(`   BNB:  ${ethers.formatEther(bnbBalance)}`);
  } catch (e: any) {
    console.log(`   ERROR reading balances: ${e.message}`);
  }

  // ─── Rank ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("🏆 RANK SYSTEM");
  console.log("═══════════════════════════════════════════════");

  try {
    const rank = await rankSystem.userRank(wallet);
    console.log(`   Current rank: ${rank}`);
  } catch (e: any) {
    try {
      const rank = await rankSystem.ranks(wallet);
      console.log(`   Current rank: ${rank}`);
    } catch (e2: any) {
      console.log(`   ERROR reading rank: ${e.message}`);
    }
  }

  // ─── Contract addresses being queried ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("📌 CONTRACT ADDRESSES USED");
  console.log("═══════════════════════════════════════════════");
  console.log(`   Referral:         ${addresses.OSLOReferral}`);
  console.log(`   InvestmentEngine: ${addresses.OSLOInvestmentEngine}`);
  console.log(`   OSLOToken:        ${addresses.OSLOToken}`);
  console.log(`   USDT:             ${addresses.USDT}`);
  console.log(`   RankSystem:       ${addresses.OSLORankSystem}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
