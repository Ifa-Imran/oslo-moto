import { ethers } from "hardhat";

/**
 * Sync DEX reserves: drain all USDT then re-inject via injectUSDTLiquidity.
 * This makes usdtReserve match the actual USDT balance.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const dex = await ethers.getContractAt("OSLODexV2", DEX_ADDR);

  // Check current state
  const [usdtResBefore, osloResBefore] = await dex.getReserves();
  const actualUsdtBefore = await usdt.balanceOf(DEX_ADDR);
  console.log("\n═══ Before ═══");
  console.log("  Actual USDT balance:", ethers.formatEther(actualUsdtBefore));
  console.log("  Tracked usdtReserve:", ethers.formatEther(usdtResBefore));
  console.log("  Mismatch:", ethers.formatEther(actualUsdtBefore - usdtResBefore), "USDT");

  if (actualUsdtBefore === usdtResBefore) {
    console.log("\n  ✓ Already synced. Nothing to do.");
    return;
  }

  // Step 1: Drain ALL USDT from DEX (drainUSDT(0) = drain all)
  console.log("\n── Step 1: Drain all USDT from DEX ──");
  const tx = await dex.drainUSDT(0);
  await tx.wait();
  console.log("  ✓ Drained", ethers.formatEther(actualUsdtBefore), "USDT to deployer");

  // Verify DEX is empty
  const [usdtResAfterDrain] = await dex.getReserves();
  const actualAfterDrain = await usdt.balanceOf(DEX_ADDR);
  console.log("  usdtReserve after drain:", ethers.formatEther(usdtResAfterDrain));
  console.log("  Actual USDT after drain:", ethers.formatEther(actualAfterDrain));

  // Step 2: Approve and re-inject ALL USDT
  console.log("\n── Step 2: Re-inject USDT into DEX ──");
  const approveTx = await usdt.approve(DEX_ADDR, actualUsdtBefore);
  await approveTx.wait();
  console.log("  ✓ Approved");

  const injectTx = await dex.injectUSDTLiquidity(actualUsdtBefore);
  await injectTx.wait();
  console.log("  ✓ Injected", ethers.formatEther(actualUsdtBefore), "USDT");

  // Step 3: Verify sync
  const [usdtResAfter, osloResAfter] = await dex.getReserves();
  const actualAfter = await usdt.balanceOf(DEX_ADDR);
  console.log("\n═══ After ═══");
  console.log("  Actual USDT balance:", ethers.formatEther(actualAfter));
  console.log("  Tracked usdtReserve:", ethers.formatEther(usdtResAfter));
  console.log("  Mismatch:", ethers.formatEther(actualAfter - usdtResAfter), "USDT");
  console.log("  Price:", ethers.formatEther(await dex.getPrice()), "USDT/OSLO");

  if (actualAfter === usdtResAfter) {
    console.log("\n  ✓ Reserves synced successfully!");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
