import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX = "0x5A7C5046FbB6aDdF7Ae36D08Ab0A603be694798C";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  const dex = await ethers.getContractAt("OSLODexV2", DEX);
  const usdtToken = await ethers.getContractAt("IERC20", USDT);
  const osloToken = await ethers.getContractAt("IERC20", OSLO);

  // Check reserves
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("\nCurrent DEX state:");
  console.log("  USDT Reserve:", ethers.formatUnits(usdtRes, 18));
  console.log("  OSLO Reserve:", ethers.formatUnits(osloRes, 18));
  try {
    const price = await dex.getPrice();
    console.log("  Price:", ethers.formatUnits(price, 18), "USDT/OSLO");
  } catch (e) {}

  // Drain USDT
  console.log("\nDraining USDT...");
  const usdtBefore = await usdtToken.balanceOf(deployer.address);
  const tx1 = await dex.drainUSDT(0); // 0 = all
  await tx1.wait();
  const usdtAfter = await usdtToken.balanceOf(deployer.address);
  console.log("  USDT drained:", ethers.formatUnits(usdtAfter - usdtBefore, 18));

  // Drain OSLO
  console.log("\nDraining OSLO...");
  const osloBefore = await osloToken.balanceOf(deployer.address);
  const tx2 = await dex.drainOSLO(0);
  await tx2.wait();
  const osloAfter = await osloToken.balanceOf(deployer.address);
  console.log("  OSLO drained:", ethers.formatUnits(osloAfter - osloBefore, 18));

  console.log("\nDONE - All liquidity returned to deployer");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
