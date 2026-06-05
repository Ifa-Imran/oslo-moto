import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Yield Income Zero Diagnosis ===\n");

  const vaultAbi = [
    "function totalDeposited() view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
    "function launchTimestamp() view returns (uint256)",
    "function osloDex() view returns (address)",
    "function referral() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function depositsPaused() view returns (bool)",
    "function getPendingRewards(address) view returns (uint256)",
    "function getActiveDeposit(address) view returns (uint256)",
    "function getUserTier(address) view returns (uint256)",
    "function userPools(address) view returns (uint256 totalBalance, uint256 lastClaimTime, uint256 accruedRewards, uint256 totalClaimed, uint256 maxReturn, uint256 totalCombinedEarnings, uint256 lastDepositTime, bool active)",
  ];

  const dexAbi = [
    "function getReserves() view returns (uint256 usdtReserve, uint256 osloReserve)",
    "function getPrice() view returns (uint256)",
    "function vault() view returns (address)",
  ];

  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);
  const dex = new ethers.Contract(DEX, dexAbi, deployer);

  // 1. Check Vault configuration
  console.log("── 1. VAULT CONFIG ──");
  const launchTs = await vault.launchTimestamp();
  const vaultDex = await vault.osloDex();
  const vaultRef = await vault.referral();
  const paused = await vault.depositsPaused();
  const setup = await vault.setupComplete();
  console.log("  launchTimestamp:", launchTs.toString(), "→", new Date(Number(launchTs) * 1000).toISOString());
  console.log("  osloDex:", vaultDex);
  console.log("  referral:", vaultRef);
  console.log("  depositsPaused:", paused);
  console.log("  setupComplete:", setup);
  console.log("  Now:", Math.floor(Date.now()/1000));
  console.log("  Time since launch:", Math.floor((Date.now()/1000 - Number(launchTs)) / 86400), "days");

  // 2. Check DEX state
  console.log("\n── 2. DEX STATE ──");
  const [usdtRes, osloRes] = await dex.getReserves();
  const price = await dex.getPrice();
  const dexVault = await dex.vault();
  console.log("  USDT reserve:", ethers.formatEther(usdtRes));
  console.log("  OSLO reserve:", ethers.formatEther(osloRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("  DEX.vault:", dexVault);
  console.log("  DEX.vault == Vault?", dexVault.toLowerCase() === VAULT.toLowerCase());

  // 3. Check known depositor's pool
  console.log("\n── 3. KNOWN DEPOSITOR CHECK ──");
  const knownUser = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4"; // reward wallet - had $979K
  
  const pool = await vault.userPools(knownUser);
  console.log("  User:", knownUser);
  console.log("  totalBalance:", ethers.formatEther(pool.totalBalance));
  console.log("  lastClaimTime:", pool.lastClaimTime.toString(), "→", new Date(Number(pool.lastClaimTime) * 1000).toISOString());
  console.log("  accruedRewards:", ethers.formatEther(pool.accruedRewards));
  console.log("  totalClaimed:", ethers.formatEther(pool.totalClaimed));
  console.log("  maxReturn:", ethers.formatEther(pool.maxReturn));
  console.log("  totalCombinedEarnings:", ethers.formatEther(pool.totalCombinedEarnings));
  console.log("  lastDepositTime:", pool.lastDepositTime.toString(), "→", new Date(Number(pool.lastDepositTime) * 1000).toISOString());
  console.log("  active:", pool.active);

  // 4. getPendingRewards
  console.log("\n── 4. PENDING REWARDS CALCULATION ──");
  const pending = await vault.getPendingRewards(knownUser);
  console.log("  getPendingRewards:", ethers.formatEther(pending));
  
  if (pending === 0n && pool.totalBalance > 0n && pool.active) {
    // Yield should be > 0 if user has active balance
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - Number(pool.lastClaimTime);
    console.log("  ⚠ ZERO YIELD with active deposit!");
    console.log("  Elapsed since lastClaimTime:", elapsed, "seconds (", (elapsed/3600).toFixed(1), "hours )");
    
    // Check if launchTimestamp is in the future
    if (Number(launchTs) > now) {
      console.log("  ✗ LAUNCH TIMESTAMP IS IN THE FUTURE!");
      console.log("    launchTs:", Number(launchTs), "now:", now);
      console.log("    Days until launch:", ((Number(launchTs) - now) / 86400).toFixed(1));
      console.log("    → _getDailyRate will underflow → yield is 0");
    }
    
    // Check if lastClaimTime >= now (block.timestamp)
    if (Number(pool.lastClaimTime) >= now) {
      console.log("  ✗ lastClaimTime >= now → elapsed is 0 → yield is 0");
    }
    
    // Check maxReturn vs totalClaimed
    if (pool.totalClaimed >= pool.maxReturn) {
      console.log("  ✗ 3X cap reached! totalClaimed >= maxReturn");
    }
  }

  // 5. Try another user
  console.log("\n── 5. DEPLOYER STATE ──");
  const deployerPool = await vault.userPools(deployer.address);
  console.log("  totalBalance:", ethers.formatEther(deployerPool.totalBalance));
  console.log("  active:", deployerPool.active);
  if (deployerPool.totalBalance > 0n) {
    const deployerPending = await vault.getPendingRewards(deployer.address);
    console.log("  pendingRewards:", ethers.formatEther(deployerPending));
  }
}

main().catch(console.error);
