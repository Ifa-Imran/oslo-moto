import { ethers } from "hardhat";

// ─── Addresses ───────────────────────────────────────────────────────────────
const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
const NEW_DEX = "0xb220f4A59ab079879Cc38AF2d69B0E2918Db100B"; // Just deployed
const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";
const TREASURY = "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1";
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("=".repeat(60));
  console.log("CONTINUE DEPLOY: IE + CONFIGURE ALL");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB");
  console.log("DEX (already deployed):", NEW_DEX);
  console.log("");

  // ─── Step 1: Deploy InvestmentEngine ───────────────────────────────────────
  console.log("Step 1: Deploying OSLOInvestmentEngine...");
  const IEFactory = await ethers.getContractFactory("OSLOInvestmentEngine");
  const newIE = await IEFactory.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await newIE.waitForDeployment();
  const newIEAddress = await newIE.getAddress();
  console.log("  New IE:", newIEAddress);

  // ─── Step 2: Configure DEX ─────────────────────────────────────────────────
  console.log("\nStep 2: Configuring DEX...");
  const dex = await ethers.getContractAt("OSLODEX", NEW_DEX);
  const dexSetupDone = await dex.setupComplete();
  if (!dexSetupDone) {
    let tx = await dex.configure(deployer.address, deployer.address, newIEAddress);
    await tx.wait();
    console.log("  DEX configured");
    tx = await dex.forceSetReferralContract(REFERRAL);
    await tx.wait();
    console.log("  DEX referral set");
  } else {
    console.log("  DEX already configured, updating IE...");
    let tx = await dex.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("  DEX IE updated");
  }

  // ─── Step 3: Configure IE ──────────────────────────────────────────────────
  console.log("\nStep 3: Configuring IE...");
  let tx = await newIE.configure(TREASURY, REFERRAL, RANK_SYSTEM, NEW_DEX, deployer.address);
  await tx.wait();
  console.log("  IE configured");

  tx = await newIE.setRewardWallets(deployer.address, deployer.address, deployer.address);
  await tx.wait();
  console.log("  Reward wallets set");

  // ─── Step 4: Add liquidity ─────────────────────────────────────────────────
  console.log("\nStep 4: Adding initial liquidity...");
  const usdtContract = await ethers.getContractAt("MockUSDT", USDT);
  const osloContract = await ethers.getContractAt("OSLOToken", OSLO);

  let deployerUSDT = await usdtContract.balanceOf(deployer.address);
  if (deployerUSDT < ethers.parseEther("2000")) {
    tx = await usdtContract.faucet();
    await tx.wait();
    deployerUSDT = await usdtContract.balanceOf(deployer.address);
    console.log("  Faucet: deployer USDT =", ethers.formatEther(deployerUSDT));
  }

  const deployerOSLO = await osloContract.balanceOf(deployer.address);
  console.log("  Deployer OSLO:", ethers.formatEther(deployerOSLO));

  const liqUSDT = ethers.parseEther("2000");
  const liqOSLO = ethers.parseEther("100000");

  if (deployerOSLO >= liqOSLO && deployerUSDT >= liqUSDT) {
    tx = await usdtContract.approve(NEW_DEX, liqUSDT);
    await tx.wait();
    tx = await osloContract.approve(NEW_DEX, liqOSLO);
    await tx.wait();
    tx = await dex.addInitialLiquidity(liqUSDT, liqOSLO);
    await tx.wait();
    console.log("  Added: 2,000 USDT + 100,000 OSLO (price $0.02)");
  } else if (deployerOSLO > 0n && deployerUSDT > 0n) {
    // Use whatever we have, maintain $0.02 ratio
    let osloForLiq = deployerOSLO > liqOSLO ? liqOSLO : deployerOSLO;
    let usdtForLiq = (osloForLiq * 2n) / 100n;
    if (usdtForLiq > deployerUSDT) {
      usdtForLiq = deployerUSDT;
      osloForLiq = (usdtForLiq * 100n) / 2n;
    }
    tx = await usdtContract.approve(NEW_DEX, usdtForLiq);
    await tx.wait();
    tx = await osloContract.approve(NEW_DEX, osloForLiq);
    await tx.wait();
    tx = await dex.addInitialLiquidity(usdtForLiq, osloForLiq);
    await tx.wait();
    console.log(`  Added: ${ethers.formatEther(usdtForLiq)} USDT + ${ethers.formatEther(osloForLiq)} OSLO`);
  } else {
    console.log("  SKIP: no tokens for liquidity");
  }

  // ─── Step 5: Transfer OSLO to IE ───────────────────────────────────────────
  console.log("\nStep 5: OSLO to IE for rewards...");
  const remainingOSLO = await osloContract.balanceOf(deployer.address);
  if (remainingOSLO > 0n) {
    tx = await osloContract.transfer(newIEAddress, remainingOSLO);
    await tx.wait();
    console.log("  Sent", ethers.formatEther(remainingOSLO), "OSLO to IE");
  }

  // ─── Step 6: Update Referral ───────────────────────────────────────────────
  console.log("\nStep 6: Updating Referral...");
  try {
    const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
    tx = await ref.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("  Referral IE updated");
    try { tx = await ref.setOsloDex(NEW_DEX); await tx.wait(); console.log("  Referral DEX updated"); } catch { console.log("  Referral DEX: no setter"); }
  } catch (e: any) { console.log("  Failed:", e.message?.slice(0, 80)); }

  // ─── Step 7: Update RankSystem ─────────────────────────────────────────────
  console.log("\nStep 7: Updating RankSystem...");
  try {
    const rs = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
    tx = await rs.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("  RankSystem IE updated");
  } catch (e: any) { console.log("  Failed:", e.message?.slice(0, 80)); }

  // ─── Done ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n  OSLODEX:", NEW_DEX);
  console.log("  InvestmentEngine:", newIEAddress);
  console.log("\nUpdate contracts-testnet.ts:");
  console.log(`  osloDEX:    "${NEW_DEX}"`);
  console.log(`  investmentEngine: "${newIEAddress}"`);
}

main().catch(console.error);