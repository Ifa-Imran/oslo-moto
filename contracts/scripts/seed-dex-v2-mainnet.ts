import { ethers } from "hardhat";

/**
 * Seed OSLODexV2 with initial liquidity: 100 USDT + 100,000 OSLO
 * Initial price: $0.001 per OSLO
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX_V2 = "0x1734613B59b0B976e180aF4007205A4F6D26f55f";
  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO_ADDR = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const oslo = await ethers.getContractAt("IERC20", OSLO_ADDR);
  const dex = await ethers.getContractAt("OSLODexV2", DEX_V2);

  const usdtAmount = ethers.parseEther("100");       // 100 USDT
  const osloAmount = ethers.parseEther("100000");    // 100,000 OSLO

  // Check balances
  const usdtBal = await usdt.balanceOf(deployer.address);
  const osloBal = await oslo.balanceOf(deployer.address);
  console.log("  USDT balance:", ethers.formatEther(usdtBal));
  console.log("  OSLO balance:", ethers.formatEther(osloBal));

  if (usdtBal < usdtAmount) {
    console.error(`ERROR: Insufficient USDT. Need 100, have ${ethers.formatEther(usdtBal)}`);
    process.exit(1);
  }
  if (osloBal < osloAmount) {
    console.error(`ERROR: Insufficient OSLO. Need 100,000, have ${ethers.formatEther(osloBal)}`);
    process.exit(1);
  }

  // Check if already initialized
  const initialized = await dex.liquidityInitialized();
  if (initialized) {
    console.error("ERROR: Liquidity already initialized!");
    process.exit(1);
  }

  // Approve both tokens to DEX
  console.log("\n  Approving USDT...");
  const tx1 = await usdt.approve(DEX_V2, usdtAmount);
  await tx1.wait();

  console.log("  Approving OSLO...");
  const tx2 = await oslo.approve(DEX_V2, osloAmount);
  await tx2.wait();

  // Add initial liquidity
  console.log("  Adding initial liquidity (100 USDT + 100,000 OSLO)...");
  const tx3 = await dex.addInitialLiquidity(usdtAmount, osloAmount);
  await tx3.wait();
  console.log("  ✓ Liquidity added! tx:", tx3.hash);

  // Verify
  const reserve_usdt = await dex.usdtReserve();
  const reserve_oslo = await dex.osloReserve();
  const price = await dex.lastPrice();
  console.log("\n  Final state:");
  console.log("    USDT reserve:", ethers.formatEther(reserve_usdt));
  console.log("    OSLO reserve:", ethers.formatEther(reserve_oslo));
  console.log("    Price:", ethers.formatEther(price), "USDT/OSLO");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
