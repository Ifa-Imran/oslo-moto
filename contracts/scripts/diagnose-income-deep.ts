import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Income Flow Deep Diagnosis ===\n");

  const dexAbi = [
    "function getReserves() view returns (uint256 usdtReserve, uint256 osloReserve)",
    "function getPrice() view returns (uint256)",
    "function vault() view returns (address)",
    "function getUSDTForOSLOOutput(uint256 usdtAmount) view returns (uint256)",
  ];
  const refAbi = [
    "function totalCommissionsPaid() view returns (uint256)",
    "function referralRewards(address) view returns (uint256)",
    "function getDirectReferrals(address) view returns (address[])",
    "function getReferrer(address) view returns (address)",
    "function getUnlockedLevels(address) view returns (uint256)",
    "function userInfo(address) view returns (address referrer, address[] directReferrals, uint256 unlockedLevels, uint256 totalEarned, bool registered)",
    "function totalRegistered() view returns (uint256)",
  ];
  const vaultAbi = [
    "function totalDeposited() view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
    "function getPendingRewards(address) view returns (uint256)",
    "function getActiveDeposit(address) view returns (uint256)",
    "function userPools(address) view returns (uint256 totalBalance, uint256 lastClaimTime, uint256 accruedRewards, uint256 totalClaimed, uint256 maxReturn, uint256 totalCombinedEarnings, uint256 lastDepositTime, bool active)",
  ];
  const erc20 = ["function balanceOf(address) view returns (uint256)"];

  const dex = new ethers.Contract(DEX, dexAbi, deployer);
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);
  const usdt = new ethers.Contract(USDT, erc20, deployer);
  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  // 1. DEX state
  console.log("── 1. DEX STATE ──");
  const [usdtRes, osloRes] = await dex.getReserves();
  const price = await dex.getPrice();
  console.log("  USDT reserve:", ethers.formatEther(usdtRes));
  console.log("  OSLO reserve:", ethers.formatEther(osloRes));
  console.log("  Price (USDT/OSLO):", ethers.formatEther(price));
  console.log("  DEX.vault:", await dex.vault());

  // 2. Vault state
  console.log("\n── 2. VAULT AGGREGATE STATE ──");
  const totalDep = await vault.totalDeposited();
  const totalPaid = await vault.totalRewardsPaid();
  console.log("  totalDeposited:", ethers.formatEther(totalDep));
  console.log("  totalRewardsPaid:", ethers.formatEther(totalPaid));
  console.log("  Vault USDT balance:", ethers.formatEther(await usdt.balanceOf(VAULT)));
  console.log("  Vault OSLO balance:", ethers.formatEther(await oslo.balanceOf(VAULT)));

  // 3. Referral state
  console.log("\n── 3. REFERRAL STATE ──");
  const totalComm = await ref.totalCommissionsPaid();
  console.log("  totalCommissionsPaid:", ethers.formatEther(totalComm));
  console.log("  totalRegistered:", (await ref.totalRegistered()).toString());
  console.log("  Referral OSLO balance:", ethers.formatEther(await oslo.balanceOf(REFERRAL)));

  // 4. Check a sample of depositors with active deposits
  console.log("\n── 4. SAMPLE DEPOSITORS ──");
  // Try known addresses from testnet snapshot
  const sampleAddresses = [
    deployer.address,
    "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // reward wallet
  ];

  // Try finding users with deposits by checking recent events (limit blocks)
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("  Current block:", blockNumber);

  // Check deployer's directs to find active users
  try {
    const deployerDirects = await ref.getDirectReferrals(deployer.address);
    console.log("  Deployer's direct referrals:", deployerDirects.length);
    
    // Check first few directs for deposits
    const checkAddresses = [...sampleAddresses, ...deployerDirects.slice(0, 5)];
    
    for (const addr of checkAddresses) {
      try {
        const pool = await vault.userPools(addr);
        if (pool.totalBalance > 0n) {
          console.log("\n  Active user:", addr);
          console.log("    totalBalance:", ethers.formatEther(pool.totalBalance));
          console.log("    lastClaimTime:", new Date(Number(pool.lastClaimTime) * 1000).toISOString());
          console.log("    totalClaimed:", ethers.formatEther(pool.totalClaimed));
          console.log("    totalCombinedEarnings:", ethers.formatEther(pool.totalCombinedEarnings));
          console.log("    active:", pool.active);
          
          // Check pending rewards
          const pending = await vault.getPendingRewards(addr);
          console.log("    pendingRewards:", ethers.formatEther(pending));
          
          // Check referrer
          const referrer = await ref.getReferrer(addr);
          console.log("    referrer:", referrer);
          
          // Check referrer's level income
          if (referrer !== ethers.ZeroAddress) {
            const referrerRewards = await ref.referralRewards(referrer);
            const referrerLevels = await ref.getUnlockedLevels(referrer);
            console.log("    → referrer pendingCommission:", ethers.formatEther(referrerRewards));
            console.log("    → referrer unlockedLevels:", referrerLevels.toString());
          }
        }
      } catch (e: any) {
        // Skip errors
      }
    }
  } catch (e: any) {
    console.log("  Could not get deployer directs:", e.message?.slice(0, 100));
  }

  // 5. Summary
  console.log("\n═══ DIAGNOSIS SUMMARY ═══");
  if (totalPaid === 0n) {
    console.log("  ⚠ totalRewardsPaid = 0 → No user has successfully claimed yet!");
    console.log("    Level income only triggers during claimRewards().");
    console.log("    Until a downline claims, uplines get zero commission.");
  }
  if (totalComm === 0n) {
    console.log("  ⚠ totalCommissionsPaid = 0 → Zero commission ever distributed!");
  }
  if (osloRes < ethers.parseEther("100")) {
    console.log("  ⚠ DEX OSLO reserve very low:", ethers.formatEther(osloRes));
    console.log("    Claims may fail with InsufficientOsloReserve or DEX slippage.");
  }
}

main().catch(console.error);
