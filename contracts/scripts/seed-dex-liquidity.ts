import { ethers } from "hardhat";

// Deployed contract addresses from the latest testnet deployment
const CONTRACTS = {
  usdt: "0x8B11FB2C5DF57C7016Fc2dC4b4234e0904D3ec47",
  osloToken: "0xD2F163b0921BA8A98034621e18326059391d2E01",
  liquidityManager: "0x5D84988555D2A5AEbFf9C73F654141afac33D487",
  osloDEX: "0x2f0F01fF768670104a193756a0b08496bBAad2C2",
  investmentEngine: "0x3D9C6D36Cd08a55DbFb3F1EA3531014cf44560ad",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding DEX with initial liquidity");
  console.log("Account:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("BNB Balance:", ethers.formatEther(bal));

  // Check current DEX reserves
  const dex = await ethers.getContractAt("OSLODEX", CONTRACTS.osloDEX);
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("\nCurrent DEX reserves:");
  console.log("  USDT:", ethers.formatEther(usdtRes));
  console.log("  OSLO:", ethers.formatEther(osloRes));

  if (usdtRes > 0n && osloRes > 0n) {
    console.log("DEX already seeded. No action needed.");
    return;
  }

  // Check LiquidityManager balances
  const usdt = await ethers.getContractAt("IERC20", CONTRACTS.usdt);
  const osloToken = await ethers.getContractAt("IERC20", CONTRACTS.osloToken);
  const lmOsloBal = await osloToken.balanceOf(CONTRACTS.liquidityManager);
  console.log("\nLiquidityManager OSLO balance:", ethers.formatEther(lmOsloBal));

  if (lmOsloBal === 0n) {
    console.error("ERROR: LiquidityManager has 0 OSLO. Cannot seed DEX.");
    console.error("The deploy script transferred 100K OSLO to LM — was it redeployed?");
    process.exit(1);
  }

  // Check deployer USDT balance
  const deployerUsdt = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT balance:", ethers.formatEther(deployerUsdt));

  // Mint USDT if needed
  if (deployerUsdt < ethers.parseEther("100")) {
    const mockUSDT = await ethers.getContractAt("MockUSDT", CONTRACTS.usdt);
    console.log("Minting 10,000 USDT to deployer...");
    const tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
    await tx.wait();
    console.log("Minted 10,000 USDT");
  }

  const deployerUsdtAfter = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT after mint:", ethers.formatEther(deployerUsdtAfter));

  // Seed amount: use 1000 USDT + all OSLO in LM (100K)
  const seedUSDT = ethers.parseEther("1000");

  // Transfer USDT to LiquidityManager
  console.log("\nTransferring", ethers.formatEther(seedUSDT), "USDT to LiquidityManager...");
  let tx = await usdt.transfer(CONTRACTS.liquidityManager, seedUSDT);
  await tx.wait();
  console.log("USDT transferred to LM");

  // Seed the DEX via LiquidityManager
  const liquidityManager = await ethers.getContractAt("OSLOLiquidityManager", CONTRACTS.liquidityManager);
  console.log("Calling addInitialLiquidity on LiquidityManager...");
  tx = await liquidityManager.addInitialLiquidity(seedUSDT);
  await tx.wait();
  console.log("DEX seeded!");

  // Verify
  const [usdtRes2, osloRes2] = await dex.getReserves();
  console.log("\nNew DEX reserves:");
  console.log("  USDT:", ethers.formatEther(usdtRes2));
  console.log("  OSLO:", ethers.formatEther(osloRes2));

  const price = await dex.getPrice();
  console.log("Initial price:", ethers.formatEther(price), "USDT per OSLO");
  
  // Check if referral contract has stuck USDT from failed registrations
  const referral = await ethers.getContractAt("OSLOReferral", "0xE635822290af7F181d7972e8d5c51134ae605f37");
  const referralUsdt = await usdt.balanceOf("0xE635822290af7F181d7972e8d5c51134ae605f37");
  console.log("\nReferral contract USDT balance:", ethers.formatEther(referralUsdt), "(stuck from failed registrations)");
  const feesCollected = await referral.totalFeesCollected();
  console.log("totalFeesCollected:", ethers.formatEther(feesCollected));

  console.log("\n✅ DEX seeded. Registration fee swaps should now work!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
