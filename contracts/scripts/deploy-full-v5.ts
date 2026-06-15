import { ethers } from "hardhat";

const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";
const TREASURY = "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1";
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("=".repeat(60));
  console.log("FULL FRESH DEPLOY V5: OSLOToken + DEX + IE");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB\n");

  // ─── 1. Deploy OSLOToken ───────────────────────────────────────────────────
  console.log("1. Deploying OSLOToken...");
  const TokenFactory = await ethers.getContractFactory("OSLOToken");
  const oslo = await TokenFactory.deploy();
  await oslo.waitForDeployment();
  const OSLO = await oslo.getAddress();
  console.log("   OSLOToken:", OSLO);
  console.log("   Supply:", ethers.formatEther(await oslo.totalSupply()));

  // ─── 2. Deploy OSLODEX ─────────────────────────────────────────────────────
  console.log("\n2. Deploying OSLODEX...");
  const DEXFactory = await ethers.getContractFactory("OSLODEX");
  const dex = await DEXFactory.deploy(USDT, OSLO);
  await dex.waitForDeployment();
  const DEX = await dex.getAddress();
  console.log("   OSLODEX:", DEX);

  // ─── 3. Deploy InvestmentEngine ────────────────────────────────────────────
  console.log("\n3. Deploying OSLOInvestmentEngine...");
  const IEFactory = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IEFactory.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE = await ie.getAddress();
  console.log("   InvestmentEngine:", IE);

  // ─── 4. Configure DEX ──────────────────────────────────────────────────────
  console.log("\n4. Configuring DEX...");
  let tx = await dex.configure(deployer.address, deployer.address, IE);
  await tx.wait();
  tx = await dex.forceSetReferralContract(REFERRAL);
  await tx.wait();
  console.log("   DEX configured (timelock=deployer, liqMgr=deployer, ie, referral)");

  // ─── 5. Configure IE ──────────────────────────────────────────────────────
  console.log("\n5. Configuring IE...");
  tx = await ie.configure(TREASURY, REFERRAL, RANK_SYSTEM, DEX, deployer.address);
  await tx.wait();
  tx = await ie.setRewardWallets(deployer.address, deployer.address, deployer.address);
  await tx.wait();
  console.log("   IE configured");

  // ─── 6. Add liquidity to DEX ───────────────────────────────────────────────
  console.log("\n6. Adding liquidity...");
  const erc20Abi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function faucet() external"];
  const usdtContract = new ethers.Contract(USDT, erc20Abi, deployer);

  // Get USDT via faucet
  let usdtBal = await usdtContract.balanceOf(deployer.address);
  if (usdtBal < ethers.parseEther("2000")) {
    tx = await usdtContract.faucet();
    await tx.wait();
    usdtBal = await usdtContract.balanceOf(deployer.address);
  }
  console.log("   USDT:", ethers.formatEther(usdtBal));

  const liqUSDT = ethers.parseEther("2000");
  const liqOSLO = ethers.parseEther("100000");
  tx = await usdtContract.approve(DEX, liqUSDT);
  await tx.wait();
  tx = await oslo.approve(DEX, liqOSLO);
  await tx.wait();
  tx = await dex.addInitialLiquidity(liqUSDT, liqOSLO);
  await tx.wait();
  console.log("   Added: 2,000 USDT + 100,000 OSLO (price $0.02)");

  // ─── 7. Transfer OSLO to IE for rewards ────────────────────────────────────
  console.log("\n7. Seeding IE with OSLO...");
  const ieOslo = ethers.parseEther("5000000"); // 5M OSLO for rewards
  tx = await oslo.transfer(IE, ieOslo);
  await tx.wait();
  console.log("   Sent 5,000,000 OSLO to IE");

  // ─── 8. Update Referral & RankSystem ───────────────────────────────────────
  console.log("\n8. Updating Referral & RankSystem...");
  try {
    const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
    tx = await ref.setInvestmentEngine(IE);
    await tx.wait();
    console.log("   Referral IE updated");
    try { tx = await ref.setOsloDex(DEX); await tx.wait(); console.log("   Referral DEX updated"); } catch { console.log("   Referral DEX: no setter"); }
  } catch (e: any) { console.log("   Referral:", e.message?.slice(0, 80)); }

  try {
    const rs = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
    tx = await rs.setInvestmentEngine(IE);
    await tx.wait();
    console.log("   RankSystem IE updated");
  } catch (e: any) { console.log("   RankSystem:", e.message?.slice(0, 80)); }

  // ─── Done ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\nAddresses for frontend/src/lib/contracts-testnet.ts:");
  console.log(`  osloToken:        "${OSLO}"`);
  console.log(`  osloDEX:          "${DEX}"`);
  console.log(`  investmentEngine: "${IE}"`);
  console.log(`  usdt:             "${USDT}"`);
  console.log(`  referral:         "${REFERRAL}"`);
  console.log(`  rankSystem:       "${RANK_SYSTEM}"`);
}

main().catch(console.error);