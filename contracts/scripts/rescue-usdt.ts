import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const lm = await ethers.getContractAt("OSLOLiquidityManager", "0x92EBAa88e89f85eAd236227BEdd06ad892C77a92");
  const usdt = await ethers.getContractAt("IERC20", "0x55d398326f99059fF775485246999027B3197955");

  // Rescue USDT
  const lmBal = await usdt.balanceOf("0x92EBAa88e89f85eAd236227BEdd06ad892C77a92");
  console.log("LM USDT balance:", ethers.formatEther(lmBal));
  
  if (lmBal > 0n) {
    console.log("Rescuing USDT from old LiquidityManager...");
    const tx = await lm.rescueERC20("0x55d398326f99059fF775485246999027B3197955", lmBal);
    await tx.wait();
    console.log("Done!");
  }

  const bal = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT balance:", ethers.formatEther(bal));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
