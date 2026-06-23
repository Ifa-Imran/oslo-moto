import { ethers } from "hardhat";

/**
 * Seed DEX liquidity with USDT from deployer wallet.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/seed-liquidity.ts --network bscMainnet
 *
 * BSC mainnet USDT uses 18 decimals (BEP-20).
 */

const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
const OSLO_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";

// Amount of USDT to add (18 decimals on BSC)
const USDT_AMOUNT = ethers.parseUnits("100", 18);
// OSLO already at DEX (100,000 tokens with 18 decimals)
const OSLO_AMOUNT = ethers.parseEther("100000");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // --- Check balances ---
  const usdtABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address, uint256) returns (bool)",
    "function decimals() view returns (uint8)",
  ];
  const usdt = new ethers.Contract(USDT_ADDR, usdtABI, deployer);
  const osloABI = [
    "function balanceOf(address) view returns (uint256)",
  ];
  const oslo = new ethers.Contract(OSLO_ADDR, osloABI, deployer);

  const deployerUsdt = await usdt.balanceOf(deployer.address);
  const dexUsdt = await usdt.balanceOf(DEX_ADDR);
  const dexOslo = await oslo.balanceOf(DEX_ADDR);
  const usdtDecimals = await usdt.decimals();

  console.log("\n=== Current State ===");
  console.log(`USDT decimals: ${usdtDecimals}`);
  console.log(`Deployer USDT: ${ethers.formatUnits(deployerUsdt, usdtDecimals)}`);
  console.log(`DEX USDT:      ${ethers.formatUnits(dexUsdt, usdtDecimals)}`);
  console.log(`DEX OSLO:      ${ethers.formatEther(dexOslo)}`);

  if (deployerUsdt < USDT_AMOUNT) {
    console.error(`\n❌ Insufficient USDT. Need ${ethers.formatUnits(USDT_AMOUNT, usdtDecimals)}, have ${ethers.formatUnits(deployerUsdt, usdtDecimals)}`);
    process.exit(1);
  }

  // --- Step 1: Transfer USDT to DEX ---
  console.log(`\n=== Step 1: Transfer ${ethers.formatUnits(USDT_AMOUNT, usdtDecimals)} USDT to DEX ===`);
  const tx1 = await usdt.transfer(DEX_ADDR, USDT_AMOUNT);
  console.log(`TX: https://bscscan.com/tx/${tx1.hash}`);
  await tx1.wait();
  console.log("✅ USDT transferred to DEX");

  // --- Step 2: Call seedLiquidity ---
  console.log(`\n=== Step 2: Call seedLiquidity(${ethers.formatUnits(USDT_AMOUNT, usdtDecimals)} USDT, ${ethers.formatEther(OSLO_AMOUNT)} OSLO) ===`);
  const dexABI = [
    "function seedLiquidity(uint256, uint256) external",
    "function getPrice() view returns (uint256)",
    "function usdtReserve() view returns (uint256)",
    "function osloReserve() view returns (uint256)",
  ];
  const dex = new ethers.Contract(DEX_ADDR, dexABI, deployer);

  const tx2 = await dex.seedLiquidity(USDT_AMOUNT, OSLO_AMOUNT);
  console.log(`TX: https://bscscan.com/tx/${tx2.hash}`);
  await tx2.wait();
  console.log("✅ seedLiquidity called");

  // --- Verify ---
  const newPrice = await dex.getPrice();
  const newUsdtReserve = await dex.usdtReserve();
  const newOsloReserve = await dex.osloReserve();
  const newDexUsdt = await usdt.balanceOf(DEX_ADDR);

  console.log("\n=== Final State ===");
  console.log(`DEX USDT balance:  ${ethers.formatUnits(newDexUsdt, usdtDecimals)}`);
  console.log(`usdtReserve:       ${ethers.formatUnits(newUsdtReserve, usdtDecimals)}`);
  console.log(`osloReserve:       ${ethers.formatEther(newOsloReserve)}`);
  console.log(`OSLO Price:        $${ethers.formatUnits(newPrice, 18)} (per OSLO)`);
  console.log("\n✅ Liquidity seeding complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
