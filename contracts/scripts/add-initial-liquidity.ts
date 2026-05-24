import { ethers } from "hardhat";

// Deployed addresses
const USDT_ADDRESS = "0x604544CB446D4eEa0A4Fb948312B019215915007";
const OSLO_ADDRESS = "0x374111392aEA529e5c7ECFd4a6CCFECca0a44DEB";
const DEX_ADDRESS = "0xEBe104F0A05B643B0340fCb655da33BB1031C0D9";
const LM_ADDRESS = "0x5dc63eC0b0C35FcD087430D4eb0156EEc335cA44";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const mockUSDT = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_ADDRESS);
  const osloDEX = await ethers.getContractAt("OSLODEX", DEX_ADDRESS);
  const lm = await ethers.getContractAt("OSLOLiquidityManager", LM_ADDRESS);

  // Check DEX reserves
  const [usdtRes, osloRes] = await osloDEX.getReserves();
  console.log("DEX USDT Reserve:", ethers.formatEther(usdtRes));
  console.log("DEX OSLO Reserve:", ethers.formatEther(osloRes));
  console.log("DEX OSLO Balance:", ethers.formatEther(await osloToken.balanceOf(DEX_ADDRESS)));

  // Check LM balances
  console.log("LM USDT Balance:", ethers.formatEther(await mockUSDT.balanceOf(LM_ADDRESS)));
  console.log("LM OSLO Balance:", ethers.formatEther(await osloToken.balanceOf(LM_ADDRESS)));

  // Check deployer USDT balance
  console.log("Deployer USDT Balance:", ethers.formatEther(await mockUSDT.balanceOf(deployer.address)));

  const lmOsloBalance = await osloToken.balanceOf(LM_ADDRESS);
  if (lmOsloBalance === 0n) {
    console.log("ERROR: LM has no OSLO — cannot add liquidity");
    return;
  }

  // We need some USDT to pair. Let's use a small amount for initial price discovery.
  // 1,000 USDT paired with 100,000 OSLO → initial price 0.01 USDT/OSLO
  const usdtAmount = ethers.parseEther("1000");

  // Transfer USDT from deployer to LM
  const deployerUsdt = await mockUSDT.balanceOf(deployer.address);
  if (deployerUsdt < usdtAmount) {
    console.log("Minting additional USDT to deployer...");
    let tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
    await tx.wait();
  }

  console.log("\nTransferring USDT to LiquidityManager...");
  let tx = await mockUSDT.transfer(LM_ADDRESS, usdtAmount);
  await tx.wait();
  console.log("Transferred", ethers.formatEther(usdtAmount), "USDT to LM");

  // Add initial liquidity
  console.log("\nAdding initial liquidity to DEX...");
  tx = await lm.addInitialLiquidity(usdtAmount);
  await tx.wait();
  console.log("Initial liquidity added!");

  // Verify
  const [usdtRes2, osloRes2] = await osloDEX.getReserves();
  console.log("\nDEX Reserves After:");
  console.log("  USDT:", ethers.formatEther(usdtRes2));
  console.log("  OSLO:", ethers.formatEther(osloRes2));
  console.log("  Initial Price:", Number(usdtRes2) / 1e18 / (Number(osloRes2) / 1e18), "USDT per OSLO");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
