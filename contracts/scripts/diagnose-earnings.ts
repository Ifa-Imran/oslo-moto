import { ethers } from "hardhat";

const VAULT_ABI = [
  "function getPendingRewards(address user) external view returns (uint256 pendingUSDT)",
  "function getActiveDeposit(address user) external view returns (uint256)",
  "function getUserTier(address user) external view returns (uint256)",
  "function getCombinedEarnings(address user) external view returns (uint256)",
  "function getUserPool(address user) external view returns (tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))",
  "function totalDeposited() external view returns (uint256)",
  "function totalDepositors() external view returns (uint256)",
];

const IE_ABI = [
  "function getPendingRewards(address user, uint256 depositIndex) external view returns (uint256 pendingUSDT)",
  "function getActiveDeposit(address user) external view returns (uint256)",
  "function getDepositCount(address user) external view returns (uint256)",
  "function getUserTier(address user) external view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Earnings Diagnostic ===");
  console.log("Deployer:", deployer.address);

  // Contract addresses
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const OLD_DEX = "0x5A7C5046FbB6aDdF7Ae36D08Ab0A603be694798C";
  const NEW_DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";

  // ─── Check Vault ────────────────────────────────────────────
  console.log("\n─── Vault (osloVault: %s) ───", VAULT);
  const vault = new ethers.Contract(VAULT, VAULT_ABI, deployer);

  try {
    const pending = await vault.getPendingRewards(deployer.address);
    console.log("  getPendingRewards: %s USDT (%s)", pending.toString(), ethers.formatEther(pending));
  } catch (e: any) {
    console.log("  getPendingRewards: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const active = await vault.getActiveDeposit(deployer.address);
    console.log("  getActiveDeposit:  %s USDT (%s)", active.toString(), ethers.formatEther(active));
  } catch (e: any) {
    console.log("  getActiveDeposit: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const tier = await vault.getUserTier(deployer.address);
    console.log("  getUserTier:       %s", tier.toString());
  } catch (e: any) {
    console.log("  getUserTier: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const combined = await vault.getCombinedEarnings(deployer.address);
    console.log("  getCombinedEarnings: %s USDT (%s)", combined.toString(), ethers.formatEther(combined));
  } catch (e: any) {
    console.log("  getCombinedEarnings: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const pool = await vault.getUserPool(deployer.address);
    console.log("  getUserPool:       %s", JSON.stringify(pool.map((x: any) => typeof x === 'bigint' ? x.toString() : x)));
  } catch (e: any) {
    console.log("  getUserPool: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const totalDep = await vault.totalDeposited();
    console.log("  totalDeposited:    %s USDT (%s)", totalDep.toString(), ethers.formatEther(totalDep));
  } catch (e: any) {
    console.log("  totalDeposited: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const depositors = await vault.totalDepositors();
    console.log("  totalDepositors:   %s", depositors.toString());
  } catch (e: any) {
    console.log("  totalDepositors: ERROR -", e.message?.slice(0, 100));
  }

  // ─── Check IE ───────────────────────────────────────────────
  console.log("\n─── InvestmentEngine (0x%s) ───", IE.slice(2, 10));
  const ie = new ethers.Contract(IE, IE_ABI, deployer);

  try {
    const active = await ie.getActiveDeposit(deployer.address);
    console.log("  getActiveDeposit:  %s USDT (%s)", active.toString(), ethers.formatEther(active));
  } catch (e: any) {
    console.log("  getActiveDeposit: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const count = await ie.getDepositCount(deployer.address);
    console.log("  getDepositCount:   %s", count.toString());
  } catch (e: any) {
    console.log("  getDepositCount: ERROR -", e.message?.slice(0, 100));
  }

  try {
    const tier = await ie.getUserTier(deployer.address);
    console.log("  getUserTier:       %s", tier.toString());
  } catch (e: any) {
    console.log("  getUserTier: ERROR -", e.message?.slice(0, 100));
  }

  for (let i = 0; i < 5; i++) {
    try {
      const pending = await ie.getPendingRewards(deployer.address, i);
      if (pending > 0n) {
        console.log("  getPendingRewards[%d]: %s USDT", i, ethers.formatEther(pending));
      }
    } catch (e: any) {
      break;
    }
  }

  // ─── DEX State ──────────────────────────────────────────────
  console.log("\n─── DEX State ───");
  const dexAbi = ["function getReserves() external view returns (uint256 usdt, uint256 oslo)"];
  
  try {
    const newDex = new ethers.Contract(NEW_DEX, dexAbi, deployer);
    const [usdt, oslo] = await newDex.getReserves();
    console.log("  New DEX:  %s USDT + %s OSLO → $%s/OSLO",
      ethers.formatEther(usdt), ethers.formatEther(oslo),
      (Number(usdt) / Number(oslo)).toFixed(2));
  } catch (e: any) {
    console.log("  New DEX: ERROR -", e.message?.slice(0, 100));
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
