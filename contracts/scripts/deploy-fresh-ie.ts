import { ethers } from "hardhat";

// ─── Existing Testnet Addresses (correct, v4) ───────────────────────────────
const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";
const TREASURY = "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1";
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("FRESH DEPLOY: OSLODEX + IE (with correct USDT)");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("USDT:", USDT);
  console.log("OSLO:", OSLO);
  console.log("");

  // ─── Step 1: Deploy new OSLODEX ────────────────────────────────────────────
  console.log("Step 1: Deploying OSLODEX...");
  const DEXFactory = await ethers.getContractFactory("OSLODEX");
  const newDEX = await DEXFactory.deploy(USDT, OSLO);
  await newDEX.waitForDeployment();
  const newDEXAddress = await newDEX.getAddress();
  console.log("  New DEX:", newDEXAddress);

  // ─── Step 2: Deploy new InvestmentEngine ───────────────────────────────────
  console.log("\nStep 2: Deploying OSLOInvestmentEngine...");
  const IEFactory = await ethers.getContractFactory("OSLOInvestmentEngine");
  const newIE = await IEFactory.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await newIE.waitForDeployment();
  const newIEAddress = await newIE.getAddress();
  console.log("  New IE:", newIEAddress);

  // ─── Step 3: Configure DEX ─────────────────────────────────────────────────
  console.log("\nStep 3: Configuring DEX...");
  let tx = await newDEX.configure(deployer.address, deployer.address, newIEAddress);
  await tx.wait();
  console.log("  DEX configured (timelock=deployer, liqMgr=deployer, ie=newIE)");

  // Set referral contract on DEX
  tx = await newDEX.forceSetReferralContract(REFERRAL);
  await tx.wait();
  console.log("  DEX referralContract set to:", REFERRAL);

  // ─── Step 4: Configure IE ──────────────────────────────────────────────────
  console.log("\nStep 4: Configuring IE...");
  tx = await newIE.configure(TREASURY, REFERRAL, RANK_SYSTEM, newDEXAddress, deployer.address);
  await tx.wait();
  console.log("  IE configured (treasury, referral, rankSystem, dex, timelock)");

  // Set reward wallets (all to deployer for testnet simplicity)
  tx = await newIE.setRewardWallets(deployer.address, deployer.address, deployer.address);
  await tx.wait();
  console.log("  IE reward wallets set to deployer");

  // ─── Step 5: Add initial liquidity to DEX ──────────────────────────────────
  console.log("\nStep 5: Adding initial liquidity...");
  const usdtContract = await ethers.getContractAt("MockUSDT", USDT);
  const osloContract = await ethers.getContractAt("OSLOToken", OSLO);

  // Mint USDT for deployer if needed (faucet gives 10k)
  const deployerUSDT = await usdtContract.balanceOf(deployer.address);
  console.log("  Deployer USDT:", ethers.formatEther(deployerUSDT));
  if (deployerUSDT < ethers.parseEther("2000")) {
    tx = await usdtContract.faucet();
    await tx.wait();
    console.log("  Minted 10,000 USDT via faucet");
  }

  const deployerOSLO = await osloContract.balanceOf(deployer.address);
  console.log("  Deployer OSLO:", ethers.formatEther(deployerOSLO));

  // Add 2000 USDT + 100000 OSLO as initial liquidity (price = $0.02)
  const liqUSDT = ethers.parseEther("2000");
  const liqOSLO = ethers.parseEther("100000");

  if (deployerOSLO >= liqOSLO) {
    tx = await usdtContract.approve(newDEXAddress, liqUSDT);
    await tx.wait();
    tx = await osloContract.approve(newDEXAddress, liqOSLO);
    await tx.wait();
    tx = await newDEX.addInitialLiquidity(liqUSDT, liqOSLO);
    await tx.wait();
    console.log("  Added liquidity: 2,000 USDT + 100,000 OSLO (price: $0.02)");
  } else {
    console.log("  WARNING: Not enough OSLO for liquidity. Need 100,000 OSLO.");
    console.log("  Trying with available OSLO...");
    if (deployerOSLO > 0n) {
      const adjustedUSDT = (deployerOSLO * 2n) / 100n; // maintain 0.02 ratio
      tx = await usdtContract.approve(newDEXAddress, adjustedUSDT);
      await tx.wait();
      tx = await osloContract.approve(newDEXAddress, deployerOSLO);
      await tx.wait();
      tx = await newDEX.addInitialLiquidity(adjustedUSDT, deployerOSLO);
      await tx.wait();
      console.log(`  Added liquidity: ${ethers.formatEther(adjustedUSDT)} USDT + ${ethers.formatEther(deployerOSLO)} OSLO`);
    }
  }

  // ─── Step 6: Transfer OSLO to IE for rewards ───────────────────────────────
  console.log("\nStep 6: Transferring OSLO to IE for rewards...");
  const remainingOSLO = await osloContract.balanceOf(deployer.address);
  if (remainingOSLO > 0n) {
    tx = await osloContract.transfer(newIEAddress, remainingOSLO);
    await tx.wait();
    console.log("  Transferred", ethers.formatEther(remainingOSLO), "OSLO to IE");
  } else {
    console.log("  No remaining OSLO to transfer");
  }

  // ─── Step 7: Update Referral to point to new IE + DEX ──────────────────────
  console.log("\nStep 7: Updating Referral...");
  try {
    const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);
    tx = await referral.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("  Referral IE updated");
    // Update DEX pointer on referral if function exists
    try {
      tx = await referral.setOsloDex(newDEXAddress);
      await tx.wait();
      console.log("  Referral DEX updated");
    } catch {
      console.log("  Referral DEX update skipped (no setOsloDex)");
    }
  } catch (e: any) {
    console.log("  Referral update failed:", e.message?.slice(0, 100));
  }

  // ─── Step 8: Update RankSystem ─────────────────────────────────────────────
  console.log("\nStep 8: Updating RankSystem...");
  try {
    const rankSystem = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
    tx = await rankSystem.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("  RankSystem IE updated");
  } catch (e: any) {
    console.log("  RankSystem update failed:", e.message?.slice(0, 100));
  }

  // ─── Done ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\nNew addresses:");
  console.log("  OSLODEX:", newDEXAddress);
  console.log("  OSLOInvestmentEngine:", newIEAddress);
  console.log("\nUpdate frontend/src/lib/contracts-testnet.ts:");
  console.log(`  osloDEX:    "${newDEXAddress}"`);
  console.log(`  investmentEngine: "${newIEAddress}"`);
}

main().catch(console.error);