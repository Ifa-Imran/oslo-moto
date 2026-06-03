import { ethers } from "hardhat";

/**
 * Drain all USDT liquidity from OSLODEX to deployer wallet.
 * Admin is still open (completeSetup was NOT called).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX_ADDR = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";
  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";

  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDR);
  const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDT_ADDR);

  // Check current state
  const [usdtReserve, osloReserve] = await dex.getReserves();
  const dexUsdtBalance = await usdt.balanceOf(DEX_ADDR);
  const deployerUsdtBefore = await usdt.balanceOf(deployer.address);

  console.log("\n📊 Current DEX State:");
  console.log("  USDT Reserve:", ethers.formatEther(usdtReserve), "USDT");
  console.log("  OSLO Reserve:", ethers.formatEther(osloReserve), "OSLO");
  console.log("  DEX USDT Balance:", ethers.formatEther(dexUsdtBalance), "USDT");
  console.log("  Deployer USDT Before:", ethers.formatEther(deployerUsdtBefore), "USDT");

  // Drain all USDT (amount = 0 means drain all)
  console.log("\n⚙️  Draining all USDT from DEX...");
  const tx = await dex.drainUSDT(0, {
    gasPrice: ethers.parseUnits("1", "gwei"),
  });
  console.log("  tx:", tx.hash);
  await tx.wait();

  // Verify
  const deployerUsdtAfter = await usdt.balanceOf(deployer.address);
  const [newUsdtReserve, newOsloReserve] = await dex.getReserves();

  console.log("\n✅ Drain complete!");
  console.log("  Deployer USDT After:", ethers.formatEther(deployerUsdtAfter), "USDT");
  console.log("  Amount Received:", ethers.formatEther(deployerUsdtAfter - deployerUsdtBefore), "USDT");
  console.log("  DEX USDT Reserve Now:", ethers.formatEther(newUsdtReserve), "USDT");
  console.log("  DEX OSLO Reserve Now:", ethers.formatEther(newOsloReserve), "OSLO");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
