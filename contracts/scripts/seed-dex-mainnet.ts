import { ethers } from "hardhat";

/**
 * Seed DEX with additional USDT liquidity (post-initial-seed)
 * =============================================================
 * Transfers USDT from deployer → LiquidityManager, then calls addLiquidityFromFees.
 * This adds USDT to reserves without needing more OSLO.
 * Price increases: new_price = (old_usdt + new_usdt) / oslo_reserve
 *
 * Run: npx hardhat run scripts/seed-dex-mainnet.ts --network bscMainnet
 */

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const LM_ADDR = "0xF903159AEAA09d08B35978B3333e9D07172f9e41";
const DEX_ADDR = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";

// ─── Set your seed amount here ───
const SEED_USDT = ethers.parseEther("10115"); // 10,115 USDT

const GAS_PRICE = ethers.parseUnits("1", "gwei");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const LM_ABI = [
  "function addLiquidityFromFees(uint256 usdtAmount) external",
];

const DEX_ABI = [
  "function getReserves() view returns (uint256 usdtReserve, uint256 osloReserve)",
  "function getPrice() view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = await deployer.getAddress();
  const txOpts = { gasPrice: GAS_PRICE };

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   OSLO DEX — SEED INITIAL LIQUIDITY                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("Deployer:", admin);

  const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, deployer);
  const lm = new ethers.Contract(LM_ADDR, LM_ABI, deployer);
  const dex = new ethers.Contract(DEX_ADDR, DEX_ABI, deployer);

  // Check balances
  const usdtBal = await usdt.balanceOf(admin);
  console.log(`USDT in wallet: ${ethers.formatEther(usdtBal)}`);

  if (usdtBal < SEED_USDT) {
    console.error(`\n❌ Not enough USDT. Need ${ethers.formatEther(SEED_USDT)}, have ${ethers.formatEther(usdtBal)}`);
    process.exit(1);
  }

  // Step 1: Transfer USDT to LiquidityManager
  console.log(`\n1. Transferring ${ethers.formatEther(SEED_USDT)} USDT → LiquidityManager...`);
  const tx1 = await usdt.transfer(LM_ADDR, SEED_USDT, txOpts);
  await tx1.wait();
  console.log("   ✓ Done");

  // Step 2: Call addLiquidityFromFees (adds USDT to reserves, no OSLO needed)
  console.log(`2. Calling addLiquidityFromFees(${ethers.formatEther(SEED_USDT)})...`);
  const tx2 = await lm.addLiquidityFromFees(SEED_USDT, txOpts);
  await tx2.wait();
  console.log("   ✓ Done");

  // Step 3: Verify
  const [rU, rO] = await dex.getReserves();
  const price = await dex.getPrice();
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("DEX SEEDED SUCCESSFULLY");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`USDT Reserve:  ${ethers.formatEther(rU)}`);
  console.log(`OSLO Reserve:  ${ethers.formatEther(rO)}`);
  console.log(`OSLO Price:    ${ethers.formatEther(price)} USDT/OSLO`);
  console.log("════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
