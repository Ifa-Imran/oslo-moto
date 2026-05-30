import { ethers } from "hardhat";

// Addresses from latest testnet deployment (2026-05-22)
const MOCK_USDT = "0x09d872c3573F134bc66F1FE4c38023ff6cf77D56";
const OSLO_TOKEN = "0x8dCEF69fa6EEE38f9Da96c476522cA23c9C81521";
const OSLO_DEX = "0x1d3b1442deE7072E414997bAa799CD6E9B10ddF5";
const TREASURY = "0x4fF4541Bf992c74dA8869AADFb969aB28dc8E4cb";
const LIQUIDITY_MANAGER = "0x5533C918b46DD60b8A068aDAE2838Da3053A072c";
const DAO = "0x15e0d2EE107F7877731393C09BAA0899EB009035";
const RANK_SYSTEM = "0xEA37db05d1fB3D304852eF2053fFF40aD77BCF70";
const REFERRAL = "0x1fdF55cDDaB9189F61cCDAe07C7d45Ac73C45241";
const INVESTMENT_ENGINE = "0x6A659C970C4323E438b4c1eDd66B9933BE904e5B";

// Reward wallets for 2% deposit fee split
const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Finishing testnet setup with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const mockUSDT = await ethers.getContractAt("MockUSDT", MOCK_USDT);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN);
  const osloDEX = await ethers.getContractAt("OSLODEX", OSLO_DEX);
  const liquidityManager = await ethers.getContractAt("OSLOLiquidityManager", LIQUIDITY_MANAGER);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);

  let tx;

  // --- Step 10 (continued): Mark OSLODEX as sell endpoint ---
  console.log("\n--- Step 10: Setting sell endpoint ---");
  try {
    tx = await osloToken.setSellEndpoint(OSLO_DEX, true);
    await tx.wait();
    console.log("OSLODEX marked as sell endpoint");
  } catch (err: any) {
    console.log("setSellEndpoint skipped (may already be set):", err?.message?.slice(0, 80));
  }

  // --- Step 11: Transfer Token Allocations ---
  console.log("\n--- Step 11: Transferring token allocations ---");
  const CONTRACT_RESERVE = ethers.parseEther("11000000");
  const DEX_ALLOCATION = ethers.parseEther("100000");

  const ieBalance = await osloToken.balanceOf(INVESTMENT_ENGINE);
  if (ieBalance < CONTRACT_RESERVE) {
    tx = await osloToken.transfer(INVESTMENT_ENGINE, CONTRACT_RESERVE);
    await tx.wait();
    console.log("11M OSLO transferred to InvestmentEngine");
  } else {
    console.log("InvestmentEngine already has OSLO reserve");
  }

  const lmBalance = await osloToken.balanceOf(LIQUIDITY_MANAGER);
  if (lmBalance < DEX_ALLOCATION) {
    tx = await osloToken.transfer(LIQUIDITY_MANAGER, DEX_ALLOCATION);
    await tx.wait();
    console.log("100K OSLO transferred to LiquidityManager");
  } else {
    console.log("LiquidityManager already has OSLO allocation");
  }

  // --- Step 11b: Set Reward Wallets ---
  console.log("\n--- Step 11b: Setting reward wallets ---");
  try {
    tx = await investmentEngine.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
    await tx.wait();
    console.log("Reward wallets set");
  } catch (err: any) {
    console.log("setRewardWallets skipped:", err?.message?.slice(0, 80));
  }

  // --- Step 12: Mint test USDT ---
  console.log("\n--- Step 12: Minting test USDT ---");
  const usdtBalance = await mockUSDT.balanceOf(deployer.address);
  if (usdtBalance < ethers.parseEther("5000")) {
    tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
    await tx.wait();
    console.log("Minted 10,000 USDT to deployer");
  } else {
    console.log("Deployer already has USDT:", ethers.formatEther(usdtBalance));
  }

  // --- Step 12b: Seed DEX with initial liquidity ---
  console.log("\n--- Step 12b: Seeding DEX with initial liquidity ---");
  const [dexU, dexO] = await osloDEX.getReserves();
  if (dexU === 0n) {
    const seedUSDT = ethers.parseEther("1000");
    tx = await mockUSDT.transfer(LIQUIDITY_MANAGER, seedUSDT);
    await tx.wait();
    console.log("Transferred 1000 USDT to LiquidityManager");
    tx = await liquidityManager.addInitialLiquidity(seedUSDT);
    await tx.wait();
    const [u, o] = await osloDEX.getReserves();
    console.log("DEX seeded:", ethers.formatEther(u), "USDT +", ethers.formatEther(o), "OSLO");
  } else {
    console.log("DEX already seeded:", ethers.formatEther(dexU), "USDT +", ethers.formatEther(dexO), "OSLO");
  }

  // --- Step 13: Register deployer as root referral ---
  console.log("\n--- Step 13: Registering root referral ---");
  const isRegistered = (await referral.userInfo(deployer.address)).registered;
  if (!isRegistered) {
    tx = await mockUSDT.approve(REFERRAL, ethers.parseEther("1"));
    await tx.wait();
    tx = await referral.register(deployer.address, ethers.ZeroAddress);
    await tx.wait();
    console.log("Deployer registered as root referral");
  } else {
    console.log("Deployer already registered");
  }

  // --- Summary ---
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("OSLO Protocol Testnet Setup Complete!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("MockUSDT:            ", MOCK_USDT);
  console.log("OSLOToken:           ", OSLO_TOKEN);
  console.log("OSLODEX:             ", OSLO_DEX);
  console.log("OSLOTreasury:        ", TREASURY);
  console.log("OSLOLiquidityMgr:    ", LIQUIDITY_MANAGER);
  console.log("OSLODAO:             ", DAO);
  console.log("OSLORankSystem:      ", RANK_SYSTEM);
  console.log("OSLOReferral:        ", REFERRAL);
  console.log("OSLOInvestmentEngine:", INVESTMENT_ENGINE);
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
