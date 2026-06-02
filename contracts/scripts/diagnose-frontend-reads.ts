/**
 * Diagnoses why the frontend shows zero for portfolio/staking/team data.
 * Calls the exact same contract functions the frontend uses via wagmi.
 * 
 * Usage: npx hardhat run scripts/diagnose-frontend-reads.ts --network bscTestnet
 */
import { ethers } from "hardhat";
import addresses from "../data/testnet-addresses.json";

// The wallet that should have data (user's registered wallet from mainnet snapshot)
const TEST_WALLET = process.env.WALLET || "0x1d8896b5E2f1C1d9F5c6eB5e0a7fFe0a3EeAb862";

// Minimal ABI fragments — exactly what the frontend calls
const IE_ABI = [
  "function getActiveDeposit(address user) view returns (uint256)",
  "function getUserTier(address user) view returns (uint256)",
  "function getDepositCount(address user) view returns (uint256)",
  "function getCombinedEarnings(address user) view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function totalRewardsPaid() view returns (uint256)",
  "function totalWithdrawn() view returns (uint256)",
  "function depositsPaused() view returns (bool)",
  "function launchTimestamp() view returns (uint256)",
  "function userDeposits(address, uint256) view returns (uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositTime, uint256 lastClaimTime, uint256 totalClaimed, uint256 maxReturn, bool active)",
  "function getPendingRewards(address user, uint256 depositIndex) view returns (uint256 pendingUSDT)",
  // These may NOT exist in current contract:
  "function getDAppBalance() view returns (uint256)",
  "function completedCycles(address) view returns (uint256)",
];

const REF_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function getReferrer(address user) view returns (address)",
  "function getDirectReferrals(address user) view returns (address[])",
  "function getQualifiedDirectsCount(address user) view returns (uint256)",
  "function getUnlockedLevels(address user) view returns (uint256)",
  "function getTeamSize(address user) view returns (uint256)",
  "function referralRewards(address) view returns (uint256)",
  "function totalRegistered() view returns (uint256)",
  "function totalCommissionsPaid() view returns (uint256)",
  "function getAllLevelIncome(address user) view returns (uint256[21])",
  "function userInfo(address) view returns (address referrer, uint256 unlockedLevels, uint256 totalEarned, bool registered)",
];

async function main() {
  const wallet = TEST_WALLET;
  console.log(`\n🔍 Diagnosing frontend reads for wallet: ${wallet}`);
  console.log(`   Chain: BSC Testnet (97)`);
  console.log(`   IE: ${addresses.OSLOInvestmentEngine}`);
  console.log(`   Referral: ${addresses.OSLOReferral}\n`);

  const provider = ethers.provider;
  const ie = new ethers.Contract(addresses.OSLOInvestmentEngine, IE_ABI, provider);
  const ref = new ethers.Contract(addresses.OSLOReferral, REF_ABI, provider);

  // ─── Referral Reads ─────────────────────────────────────────────
  console.log("═══ REFERRAL CONTRACT READS ═══");

  try {
    const registered = await ref.isRegistered(wallet);
    console.log(`  isRegistered: ${registered}`);
  } catch (e: any) { console.log(`  isRegistered: ERROR - ${e.reason || e.message}`); }

  try {
    const referrer = await ref.getReferrer(wallet);
    console.log(`  getReferrer: ${referrer}`);
  } catch (e: any) { console.log(`  getReferrer: ERROR - ${e.reason || e.message}`); }

  try {
    const directs = await ref.getDirectReferrals(wallet);
    console.log(`  getDirectReferrals: ${directs.length} addresses`);
  } catch (e: any) { console.log(`  getDirectReferrals: ERROR - ${e.reason || e.message}`); }

  try {
    const qualified = await ref.getQualifiedDirectsCount(wallet);
    console.log(`  getQualifiedDirectsCount: ${qualified}`);
  } catch (e: any) { console.log(`  getQualifiedDirectsCount: ERROR - ${e.reason || e.message}`); }

  try {
    const levels = await ref.getUnlockedLevels(wallet);
    console.log(`  getUnlockedLevels: ${levels}`);
  } catch (e: any) { console.log(`  getUnlockedLevels: ERROR - ${e.reason || e.message}`); }

  try {
    const team = await ref.getTeamSize(wallet);
    console.log(`  getTeamSize: ${team}`);
  } catch (e: any) { console.log(`  getTeamSize: ERROR - ${e.reason || e.message}`); }

  try {
    const rewards = await ref.referralRewards(wallet);
    console.log(`  referralRewards: ${ethers.formatEther(rewards)} USDT`);
  } catch (e: any) { console.log(`  referralRewards: ERROR - ${e.reason || e.message}`); }

  try {
    const totalReg = await ref.totalRegistered();
    console.log(`  totalRegistered: ${totalReg}`);
  } catch (e: any) { console.log(`  totalRegistered: ERROR - ${e.reason || e.message}`); }

  try {
    const info = await ref.userInfo(wallet);
    console.log(`  userInfo: referrer=${info.referrer}, levels=${info.unlockedLevels}, earned=${ethers.formatEther(info.totalEarned)}, registered=${info.registered}`);
  } catch (e: any) { console.log(`  userInfo: ERROR - ${e.reason || e.message}`); }

  try {
    const levelIncome = await ref.getAllLevelIncome(wallet);
    const total = Number(levelIncome[0]) / 1e18;
    console.log(`  getAllLevelIncome: total=${total.toFixed(4)} USDT`);
  } catch (e: any) { console.log(`  getAllLevelIncome: ERROR - ${e.reason || e.message}`); }

  // ─── Investment Engine Reads ────────────────────────────────────
  console.log("\n═══ INVESTMENT ENGINE READS ═══");

  try {
    const active = await ie.getActiveDeposit(wallet);
    console.log(`  getActiveDeposit: ${ethers.formatEther(active)} USDT`);
  } catch (e: any) { console.log(`  getActiveDeposit: ERROR - ${e.reason || e.message}`); }

  try {
    const tier = await ie.getUserTier(wallet);
    console.log(`  getUserTier: ${tier}`);
  } catch (e: any) { console.log(`  getUserTier: ERROR - ${e.reason || e.message}`); }

  try {
    const count = await ie.getDepositCount(wallet);
    console.log(`  getDepositCount: ${count}`);
  } catch (e: any) { console.log(`  getDepositCount: ERROR - ${e.reason || e.message}`); }

  try {
    const combined = await ie.getCombinedEarnings(wallet);
    console.log(`  getCombinedEarnings: ${ethers.formatEther(combined)} USDT`);
  } catch (e: any) { console.log(`  getCombinedEarnings: ERROR - ${e.reason || e.message}`); }

  try {
    const totalDep = await ie.totalDeposited();
    console.log(`  totalDeposited: ${ethers.formatEther(totalDep)} USDT`);
  } catch (e: any) { console.log(`  totalDeposited: ERROR - ${e.reason || e.message}`); }

  try {
    const paused = await ie.depositsPaused();
    console.log(`  depositsPaused: ${paused}`);
  } catch (e: any) { console.log(`  depositsPaused: ERROR - ${e.reason || e.message}`); }

  try {
    const launch = await ie.launchTimestamp();
    console.log(`  launchTimestamp: ${launch} (${new Date(Number(launch) * 1000).toISOString()})`);
  } catch (e: any) { console.log(`  launchTimestamp: ERROR - ${e.reason || e.message}`); }

  // These might not exist:
  try {
    const balance = await ie.getDAppBalance();
    console.log(`  getDAppBalance: ${ethers.formatEther(balance)}`);
  } catch (e: any) { console.log(`  getDAppBalance: ❌ MISSING FUNCTION - ${e.reason || e.code}`); }

  try {
    const cycles = await ie.completedCycles(wallet);
    console.log(`  completedCycles: ${cycles}`);
  } catch (e: any) { console.log(`  completedCycles: ❌ MISSING FUNCTION - ${e.reason || e.code}`); }

  // First deposit details
  try {
    const count = await ie.getDepositCount(wallet);
    if (Number(count) > 0) {
      console.log(`\n  📋 First deposit details:`);
      const dep = await ie.userDeposits(wallet, 0);
      console.log(`     amount: ${ethers.formatEther(dep.amount)} USDT`);
      console.log(`     tier: ${dep.tier}`);
      console.log(`     dailyRate: ${dep.dailyRate} bp`);
      console.log(`     depositTime: ${new Date(Number(dep.depositTime) * 1000).toISOString()}`);
      console.log(`     active: ${dep.active}`);

      const pending = await ie.getPendingRewards(wallet, 0);
      console.log(`     pendingRewards: ${ethers.formatEther(pending)} USDT`);
    }
  } catch (e: any) { console.log(`  deposit details: ERROR - ${e.reason || e.message}`); }

  console.log("\n✅ Diagnosis complete. Compare values above with what the frontend shows.");
  console.log("   If values are non-zero here but zero on frontend, the issue is frontend-side (ABI, chain, or wallet mismatch).");
  console.log("   If values are zero here too, the data wasn't properly migrated to this contract instance.");
}

main().catch(console.error);
