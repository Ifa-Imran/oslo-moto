import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";

  const osloToken = await ethers.getContractAt("IERC20", OSLO);
  const usdtToken = await ethers.getContractAt("IERC20", USDT);

  // ─── OSLO balances ───
  console.log("\n═══ OSLO Balances ═══");
  const vaultOslo = await osloToken.balanceOf(VAULT);
  const ieOslo = await osloToken.balanceOf(IE);
  const dexOslo = await osloToken.balanceOf(DEX);
  const deployerOslo = await osloToken.balanceOf(deployer.address);
  console.log("Vault OSLO:", ethers.formatUnits(vaultOslo, 18));
  console.log("IE OSLO:", ethers.formatUnits(ieOslo, 18));
  console.log("DEX OSLO:", ethers.formatUnits(dexOslo, 18));
  console.log("Deployer OSLO:", ethers.formatUnits(deployerOslo, 18));

  // ─── USDT balances ───
  console.log("\n═══ USDT Balances ═══");
  const vaultUsdt = await usdtToken.balanceOf(VAULT);
  const ieUsdt = await usdtToken.balanceOf(IE);
  const dexUsdt = await usdtToken.balanceOf(DEX);
  const deployerUsdt = await usdtToken.balanceOf(deployer.address);
  console.log("Vault USDT:", ethers.formatUnits(vaultUsdt, 18));
  console.log("IE USDT:", ethers.formatUnits(ieUsdt, 18));
  console.log("DEX USDT:", ethers.formatUnits(dexUsdt, 18));
  console.log("Deployer USDT:", ethers.formatUnits(deployerUsdt, 18));

  // ─── DEX state ───
  console.log("\n═══ DEX State ═══");
  const dex = await ethers.getContractAt("OSLODexV2", DEX);
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("USDT Reserve:", ethers.formatUnits(usdtRes, 18));
  console.log("OSLO Reserve:", ethers.formatUnits(osloRes, 18));
  const price = await dex.getPrice();
  console.log("Price:", ethers.formatUnits(price, 18), "USDT/OSLO");

  // ─── Test quote ───
  console.log("\n── Test Queries ──");
  try {
    const q = await dex.getUSDTForOSLOOutput(ethers.parseUnits("1", 18));
    console.log("getUSDTForOSLOOutput(1):", ethers.formatUnits(q, 18), "OSLO ✓");
    const q10 = await dex.getUSDTForOSLOOutput(ethers.parseUnits("10", 18));
    console.log("getUSDTForOSLOOutput(10):", ethers.formatUnits(q10, 18), "OSLO ✓");
  } catch (e: any) {
    console.log("getUSDTForOSLOOutput: ✗", e.reason || e.message);
  }

  try {
    const p = await dex.getPrice();
    console.log("getPrice():", ethers.formatUnits(p, 18), "✓");
  } catch (e: any) {
    console.log("getPrice(): ✗");
  }

  // ─── Check contract DEX pointers ───
  console.log("\n── Contract DEX Pointers ──");
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const ieContract = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  const vDex = await vault.osloDex();
  const ieDex = await ieContract.osloDex();
  console.log("Vault.osloDex:", vDex);
  console.log("IE.osloDex:", ieDex);
  console.log("Expected DEX:", DEX);

  // ─── Try to check deployer's Vault state ───
  console.log("\n── Deployer Vault State ──");
  try {
    const pool = await vault.userPools(deployer.address);
    console.log("  totalBalance:", ethers.formatUnits(pool.totalBalance, 18));
    console.log("  active:", pool.active);
    console.log("  accruedRewards:", ethers.formatUnits(pool.accruedRewards, 18));
    console.log("  totalClaimed:", ethers.formatUnits(pool.totalClaimed, 18));
    console.log("  maxReturn:", ethers.formatUnits(pool.maxReturn, 18));
  } catch (e: any) {
    console.log("  No pool:", e.reason || e.message);
  }

  // ─── Check Vault config ───
  console.log("\n── Vault Config ──");
  try {
    const vTimelock = await vault.timelock();
    const vReferral = await vault.referral();
    const vRank = await vault.rankSystem();
    const vMinClaim = await vault.minClaimThreshold();
    console.log("  timelock:", vTimelock);
    console.log("  referral:", vReferral);
    console.log("  rankSystem:", vRank);
    console.log("  minClaimThreshold:", ethers.formatUnits(vMinClaim, 18), "USDT");
  } catch (e: any) {
    console.log("  Error:", e.reason || e.message);
  }

  console.log("\n═══ ANALYSIS ═══");
  if (vaultOslo === 0n) {
    console.log("⚠️  VAULT HAS ZERO OSLO - can't pay claims!");
    console.log("   Fix: Transfer OSLO from deployer to Vault");
  }
  if (ieOslo === 0n) {
    console.log("⚠️  IE HAS ZERO OSLO - can't pay claims!");
    console.log("   Fix: Transfer OSLO from deployer to IE");
  }
  if (vaultOslo > 0n && ieOslo > 0n) {
    console.log("Both Vault and IE have OSLO. Re-check the error.");
  }

  // Check what a $10 claim would cost
  if (price > 0n) {
    const claimUSD = ethers.parseUnits("10", 18);
    const osloNeeded = (claimUSD * ethers.parseUnits("1", 18)) / price;
    console.log("\nTo pay $10 claim need:", ethers.formatUnits(osloNeeded, 18), "OSLO");
    console.log("Vault has:", ethers.formatUnits(vaultOslo, 18), "→", vaultOslo >= osloNeeded ? "SUFFICIENT" : "INSUFFICIENT");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
