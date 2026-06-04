import { ethers } from "hardhat";

/**
 * Drain ALL USDT from DEX to deployer wallet.
 * Step 1 of DEX redeployment.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const dex = await ethers.getContractAt("OSLODexV2", DEX_ADDR);

  // Before
  const [usdtRes, osloRes] = await dex.getReserves();
  const actualBal = await usdt.balanceOf(DEX_ADDR);
  const deployerBefore = await usdt.balanceOf(deployer.address);
  console.log("\n═══ Before Drain ═══");
  console.log("  DEX USDT (actual) :", ethers.formatEther(actualBal));
  console.log("  DEX USDT (tracked):", ethers.formatEther(usdtRes));
  console.log("  DEX OSLO           :", ethers.formatEther(osloRes));
  console.log("  Deployer USDT      :", ethers.formatEther(deployerBefore));

  // Drain ALL
  console.log("\n── Draining all USDT from DEX ──");
  const tx = await dex.drainUSDT(0);
  await tx.wait();
  console.log("  ✓ Drained", ethers.formatEther(actualBal), "USDT");

  // After
  const [usdtAfter, osloAfter] = await dex.getReserves();
  const actualAfter = await usdt.balanceOf(DEX_ADDR);
  const deployerAfter = await usdt.balanceOf(deployer.address);
  console.log("\n═══ After Drain ═══");
  console.log("  DEX USDT (actual) :", ethers.formatEther(actualAfter));
  console.log("  DEX USDT (tracked):", ethers.formatEther(usdtAfter));
  console.log("  DEX OSLO           :", ethers.formatEther(osloAfter), "(locked forever)");
  console.log("  Deployer USDT      :", ethers.formatEther(deployerAfter));
  console.log("  Deployer received  :", ethers.formatEther(deployerAfter - deployerBefore), "USDT");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
