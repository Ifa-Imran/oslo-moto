import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Caller:", deployer.address);

  const addrs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "mainnet-addresses.json"), "utf-8")
  );
  const LM_ADDR = addrs.OSLOLiquidityManager;
  const DEX_ADDR = addrs.OSLODEX;
  console.log("LiquidityManager:", LM_ADDR);
  console.log("OSLODEX:", DEX_ADDR);

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);
  const liquidityManager = await ethers.getContractAt("OSLOLiquidityManager", LM_ADDR);

  const lmBalance = await usdt.balanceOf(LM_ADDR);
  console.log("LiquidityManager USDT balance:", ethers.formatEther(lmBalance));

  if (lmBalance === 0n) {
    console.error("No USDT in LiquidityManager");
    process.exit(1);
  }

  console.log(`\nCalling addLiquidityFromFees(${ethers.formatEther(lmBalance)} USDT)...`);
  const tx = await liquidityManager.addLiquidityFromFees(lmBalance);
  await tx.wait();
  console.log("Done! USDT added to DEX pool.");

  // Show final reserves
  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDR);
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("\nDEX Reserves after:");
  console.log("  USDT:", ethers.formatEther(usdtRes));
  console.log("  OSLO:", ethers.formatEther(osloRes));
  console.log("  Price:", ethers.formatEther((usdtRes * BigInt(1e18)) / osloRes), "USDT/OSLO");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
