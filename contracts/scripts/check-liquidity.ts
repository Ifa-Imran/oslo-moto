import { ethers } from "hardhat";

async function main() {
  const LIQUIDITY_MANAGER = "0x61ad4917c02dC88fF45350a45E3ab63E0a20Ec30";
  
  const LiquidityManager = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = LiquidityManager.attach(LIQUIDITY_MANAGER);
  
  const totalLiquidityAdded = await lm.totalLiquidityAdded();
  const totalBurnedViaSwap = await lm.totalBurnedViaSwap();
  
  console.log("LiquidityManager State:");
  console.log("totalLiquidityAdded:", ethers.formatEther(totalLiquidityAdded), "BUSD");
  console.log("totalBurnedViaSwap:", ethers.formatEther(totalBurnedViaSwap), "OSLO");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
