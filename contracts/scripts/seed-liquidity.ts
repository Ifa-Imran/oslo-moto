import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed DEX Liquidity (Post-Deployment)
 * 
 * Two modes:
 *   A) If deployer has USDT: transfers from deployer to LiquidityManager
 *   B) If USDT already sent directly to LiquidityManager: just calls addInitialLiquidity
 * 
 * Run:
 *   npx hardhat run scripts/seed-liquidity.ts --network bscMainnet
 */

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding DEX liquidity with account:", deployer.address);

  const addrPath = path.join(__dirname, "..", "data", "mainnet-addresses.json");
  if (!fs.existsSync(addrPath)) {
    console.error("mainnet-addresses.json not found. Run deploy.ts first.");
    process.exit(1);
  }

  const addrs = JSON.parse(fs.readFileSync(addrPath, "utf-8"));
  const LIQUIDITY_MANAGER_ADDRESS = addrs.OSLOLiquidityManager;
  console.log("LiquidityManager address:", LIQUIDITY_MANAGER_ADDRESS);

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);
  const liquidityManager = await ethers.getContractAt("OSLOLiquidityManager", LIQUIDITY_MANAGER_ADDRESS);

  // Check what USDT is already in the LiquidityManager
  const lmBalance = await usdt.balanceOf(LIQUIDITY_MANAGER_ADDRESS);
  console.log("LiquidityManager current USDT balance:", ethers.formatEther(lmBalance));

  // Check deployer USDT balance
  const deployerBalance = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT balance:", ethers.formatEther(deployerBalance));

  let seedAmount = lmBalance;

  if (lmBalance > 0n) {
    // USDT already sent directly to the contract
    console.log(`\nUsing ${ethers.formatEther(lmBalance)} USDT already in LiquidityManager`);
    seedAmount = lmBalance;
  } else if (deployerBalance > 0n) {
    // Transfer from deployer to LiquidityManager first
    seedAmount = deployerBalance; // Use all available
    console.log(`\nTransferring ${ethers.formatEther(seedAmount)} USDT to LiquidityManager...`);
    const transferTx = await usdt.transfer(LIQUIDITY_MANAGER_ADDRESS, seedAmount);
    await transferTx.wait();
    console.log("USDT transferred.");
  } else {
    console.error("No USDT available! Send USDT to either:");
    console.error(`  - Deployer: ${deployer.address}`);
    console.error(`  - LiquidityManager: ${LIQUIDITY_MANAGER_ADDRESS}`);
    process.exit(1);
  }

  // Add initial liquidity
  console.log(`\nCalling addInitialLiquidity(${ethers.formatEther(seedAmount)})...`);
  const tx = await liquidityManager.addInitialLiquidity(seedAmount);
  await tx.wait();
  console.log(`DEX seeded with ${ethers.formatEther(seedAmount)} USDT successfully!`);

  // Verify
  const finalBalance = await usdt.balanceOf(LIQUIDITY_MANAGER_ADDRESS);
  console.log("\nFinal LiquidityManager USDT balance:", ethers.formatEther(finalBalance));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
