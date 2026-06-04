import { ethers } from "hardhat";

/**
 * Flush accumulated USDT from FeeRouter to admin,
 * then inject it into DEX liquidity.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";
  const FEE_ROUTER_ADDR = "0xdfc819733B0B46d51C3f180dc01648981F717097";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const feeRouter = await ethers.getContractAt("FeeRouter", FEE_ROUTER_ADDR);
  const dex = await ethers.getContractAt("OSLODexV2", DEX_ADDR);

  // Check FeeRouter balance
  const routerBal = await usdt.balanceOf(FEE_ROUTER_ADDR);
  console.log("\nFeeRouter USDT balance:", ethers.formatEther(routerBal));

  if (routerBal === 0n) {
    console.log("Nothing to flush.");
    return;
  }

  // Step 1: Flush from FeeRouter to admin
  console.log("\n── Step 1: Flush FeeRouter → Admin ──");
  let tx = await feeRouter.flush();
  await tx.wait();
  console.log("  ✓ Flushed", ethers.formatEther(routerBal), "USDT to admin");

  // Step 2: Approve DEX to pull USDT from admin
  console.log("\n── Step 2: Approve DEX ──");
  const currentAllowance = await usdt.allowance(deployer.address, DEX_ADDR);
  if (currentAllowance < routerBal) {
    tx = await usdt.approve(DEX_ADDR, ethers.MaxUint256);
    await tx.wait();
    console.log("  ✓ Approved DEX for USDT");
  } else {
    console.log("  ✓ Already approved");
  }

  // Step 3: Inject into DEX liquidity
  console.log("\n── Step 3: Inject into DEX liquidity ──");
  tx = await dex.injectUSDTLiquidity(routerBal);
  await tx.wait();
  console.log("  ✓ Injected", ethers.formatEther(routerBal), "USDT into DEX");

  // Verify
  const [usdtRes, osloRes] = await dex.getReserves();
  const price = await dex.getPrice();
  console.log("\n═══ DEX After Injection ═══");
  console.log("  USDT Reserve:", ethers.formatEther(usdtRes));
  console.log("  OSLO Reserve:", ethers.formatEther(osloRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
