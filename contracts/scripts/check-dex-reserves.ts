import { ethers } from "hardhat";

/**
 * Quick check: DEX actual USDT balance vs tracked usdtReserve
 */
async function main() {
  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const dex = await ethers.getContractAt("OSLODexV2", DEX_ADDR);

  const [usdtReserve, osloReserve] = await dex.getReserves();
  const actualUsdtBal = await usdt.balanceOf(DEX_ADDR);
  const price = await dex.getPrice();

  console.log("═══ DEX State ═══");
  console.log("  Actual USDT balance :", ethers.formatEther(actualUsdtBal));
  console.log("  Tracked usdtReserve :", ethers.formatEther(usdtReserve));
  console.log("  osloReserve          :", ethers.formatEther(osloReserve));
  console.log("  Price (from reserve) :", ethers.formatEther(price), "USDT/OSLO");
  console.log("  Actual price         :", ethers.formatEther(actualUsdtBal * ethers.parseEther("1") / osloReserve), "USDT/OSLO");

  const diff = actualUsdtBal - usdtReserve;
  console.log("\n  Mismatch (un-tracked USDT in DEX):", ethers.formatEther(diff), "USDT");
  if (diff > 0n) {
    console.log("  ⚠️  FeeRouterV2 sent USDT directly to DEX, but usdtReserve NOT updated.");
    console.log("     Sells WILL work (actual balance available), but price display is off.");
    console.log("     Fix: Admin calls drainUSDT(0) then injectUSDTLiquidity(all) to sync.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
