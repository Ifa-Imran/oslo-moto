import { ethers } from "hardhat";

const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
const NEW_DEX = "0xb220f4A59ab079879Cc38AF2d69B0E2918Db100B";
const NEW_IE = "0x8A9418c8E49bd7Bc6368b5D20fc6dd3D2DCcf97d";
const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "BNB\n");

  // Use ERC20 ABI directly to avoid artifact conflict
  const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)", "function faucet() external"];
  const usdtContract = new ethers.Contract(USDT, erc20Abi, deployer);
  const osloContract = new ethers.Contract(OSLO, erc20Abi, deployer);

  // Step 1: Mint USDT if needed
  console.log("Step 1: Getting USDT...");
  let deployerUSDT = await usdtContract.balanceOf(deployer.address);
  console.log("  USDT balance:", ethers.formatEther(deployerUSDT));
  if (deployerUSDT < ethers.parseEther("2000")) {
    let tx = await usdtContract.faucet();
    await tx.wait();
    deployerUSDT = await usdtContract.balanceOf(deployer.address);
    console.log("  After faucet:", ethers.formatEther(deployerUSDT));
  }

  // Step 2: Check OSLO
  console.log("\nStep 2: Checking OSLO...");
  const deployerOSLO = await osloContract.balanceOf(deployer.address);
  console.log("  OSLO balance:", ethers.formatEther(deployerOSLO));

  // Step 3: Add liquidity
  console.log("\nStep 3: Adding liquidity to DEX...");
  const dex = await ethers.getContractAt("OSLODEX", NEW_DEX);
  const liqUSDT = ethers.parseEther("2000");
  const liqOSLO = ethers.parseEther("100000");

  if (deployerOSLO >= liqOSLO && deployerUSDT >= liqUSDT) {
    let tx = await usdtContract.approve(NEW_DEX, liqUSDT);
    await tx.wait();
    tx = await osloContract.approve(NEW_DEX, liqOSLO);
    await tx.wait();
    tx = await dex.addInitialLiquidity(liqUSDT, liqOSLO);
    await tx.wait();
    console.log("  Added: 2,000 USDT + 100,000 OSLO");
  } else if (deployerOSLO > 0n) {
    let osloAmt = deployerOSLO > liqOSLO ? liqOSLO : deployerOSLO;
    let usdtAmt = (osloAmt * 2n) / 100n;
    if (usdtAmt > deployerUSDT) { usdtAmt = deployerUSDT; osloAmt = (usdtAmt * 100n) / 2n; }
    let tx = await usdtContract.approve(NEW_DEX, usdtAmt);
    await tx.wait();
    tx = await osloContract.approve(NEW_DEX, osloAmt);
    await tx.wait();
    tx = await dex.addInitialLiquidity(usdtAmt, osloAmt);
    await tx.wait();
    console.log(`  Added: ${ethers.formatEther(usdtAmt)} USDT + ${ethers.formatEther(osloAmt)} OSLO`);
  } else {
    console.log("  SKIP: no OSLO for liquidity");
  }

  // Step 4: Transfer remaining OSLO to IE
  console.log("\nStep 4: OSLO to IE...");
  const remainingOSLO = await osloContract.balanceOf(deployer.address);
  if (remainingOSLO > 0n) {
    let tx = await osloContract.transfer(NEW_IE, remainingOSLO);
    await tx.wait();
    console.log("  Sent", ethers.formatEther(remainingOSLO), "OSLO to IE");
  }

  // Step 5: Update Referral
  console.log("\nStep 5: Updating Referral...");
  try {
    const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
    let tx = await ref.setInvestmentEngine(NEW_IE);
    await tx.wait();
    console.log("  Referral IE updated");
    try { tx = await ref.setOsloDex(NEW_DEX); await tx.wait(); console.log("  Referral DEX updated"); } catch { console.log("  Referral DEX: no setter or not timelock"); }
  } catch (e: any) { console.log("  Failed:", e.message?.slice(0, 100)); }

  // Step 6: Update RankSystem
  console.log("\nStep 6: Updating RankSystem...");
  try {
    const rs = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
    let tx = await rs.setInvestmentEngine(NEW_IE);
    await tx.wait();
    console.log("  RankSystem IE updated");
  } catch (e: any) { console.log("  Failed:", e.message?.slice(0, 100)); }

  console.log("\n" + "=".repeat(50));
  console.log("DONE! New addresses:");
  console.log("  DEX:", NEW_DEX);
  console.log("  IE:", NEW_IE);
  console.log("=".repeat(50));
}

main().catch(console.error);