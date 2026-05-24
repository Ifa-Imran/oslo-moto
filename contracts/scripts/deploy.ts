import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OSLO Protocol V2 with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // ─── Configuration ────────────────────────────────────────────────
  // BSC Mainnet USDT address
  const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";

  // ─── Step 1: Deploy OSLOToken ─────────────────────────────────────
  console.log("\n--- Step 1: Deploying OSLOToken ---");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const osloToken = await OSLOToken.deploy();
  await osloToken.waitForDeployment();
  const osloAddress = await osloToken.getAddress();
  console.log("OSLOToken deployed to:", osloAddress);

  // ─── Step 2: Deploy OSLODEX ───────────────────────────────────────
  console.log("\n--- Step 2: Deploying OSLODEX ---");
  const OSLODEX = await ethers.getContractFactory("OSLODEX");
  const osloDEX = await OSLODEX.deploy(USDT_ADDRESS, osloAddress);
  await osloDEX.waitForDeployment();
  const osloDEXAddress = await osloDEX.getAddress();
  console.log("OSLODEX deployed to:", osloDEXAddress);

  // ─── Step 3: Deploy Treasury ──────────────────────────────────────
  console.log("\n--- Step 3: Deploying OSLOTreasury ---");
  const OSLOTreasury = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await OSLOTreasury.deploy(USDT_ADDRESS, osloAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("OSLOTreasury deployed to:", treasuryAddress);

  // ─── Step 4: Deploy LiquidityManager ──────────────────────────────
  console.log("\n--- Step 4: Deploying OSLOLiquidityManager ---");
  const OSLOLiquidityManager = await ethers.getContractFactory("OSLOLiquidityManager");
  const liquidityManager = await OSLOLiquidityManager.deploy(USDT_ADDRESS, osloAddress);
  await liquidityManager.waitForDeployment();
  const liquidityManagerAddress = await liquidityManager.getAddress();
  console.log("OSLOLiquidityManager deployed to:", liquidityManagerAddress);

  // ─── Step 5: Deploy DAO ───────────────────────────────────────────
  console.log("\n--- Step 5: Deploying OSLODAO ---");
  const OSLODAO = await ethers.getContractFactory("OSLODAO");
  const dao = await OSLODAO.deploy(USDT_ADDRESS);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("OSLODAO deployed to:", daoAddress);

  // ─── Step 6: Deploy RankSystem ────────────────────────────────────
  console.log("\n--- Step 6: Deploying OSLORankSystem ---");
  const OSLORankSystem = await ethers.getContractFactory("OSLORankSystem");
  const rankSystem = await OSLORankSystem.deploy(USDT_ADDRESS);
  await rankSystem.waitForDeployment();
  const rankSystemAddress = await rankSystem.getAddress();
  console.log("OSLORankSystem deployed to:", rankSystemAddress);

  // ─── Step 7: Deploy Referral ──────────────────────────────────────
  console.log("\n--- Step 7: Deploying OSLOReferral ---");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const referral = await OSLOReferral.deploy(USDT_ADDRESS);
  await referral.waitForDeployment();
  const referralAddress = await referral.getAddress();
  console.log("OSLOReferral deployed to:", referralAddress);

  // ─── Step 8: Deploy InvestmentEngine ──────────────────────────────
  console.log("\n--- Step 8: Deploying OSLOInvestmentEngine ---");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const investmentEngine = await OSLOInvestmentEngine.deploy(USDT_ADDRESS, osloAddress, LAUNCH_TIMESTAMP);
  await investmentEngine.waitForDeployment();
  const investmentEngineAddress = await investmentEngine.getAddress();
  console.log("OSLOInvestmentEngine deployed to:", investmentEngineAddress);

  // ─── Step 9: Wire Cross-Contract Addresses ────────────────────────
  console.log("\n--- Step 9: Wiring contracts together ---");

  // Deployer as temporary timelock for initial setup
  const timelockAddress = deployer.address;

  // OSLODEX configure
  let tx = await osloDEX.configure(timelockAddress, liquidityManagerAddress, investmentEngineAddress);
  await tx.wait();
  console.log("OSLODEX configured");

  // Treasury configure
  tx = await treasury.configure(rankSystemAddress, daoAddress, liquidityManagerAddress, timelockAddress);
  await tx.wait();
  console.log("Treasury configured");

  // LiquidityManager configure
  tx = await liquidityManager.configure(timelockAddress, osloDEXAddress);
  await tx.wait();
  console.log("LiquidityManager configured");

  // DAO configure
  tx = await dao.configure(timelockAddress, investmentEngineAddress);
  await tx.wait();
  console.log("DAO configured");

  // RankSystem configure
  tx = await rankSystem.configure(investmentEngineAddress, referralAddress, timelockAddress);
  await tx.wait();
  console.log("RankSystem configured");

  // Referral configure
  tx = await referral.configure(investmentEngineAddress, timelockAddress);
  await tx.wait();
  console.log("Referral configured");

  // InvestmentEngine configure
  tx = await investmentEngine.configure(treasuryAddress, referralAddress, rankSystemAddress, osloDEXAddress, timelockAddress);
  await tx.wait();
  console.log("InvestmentEngine configured");

  // ─── Step 10: Token Configuration ──────────────────────────────────
  console.log("\n--- Step 10: Configuring OSLOToken ---");

  tx = await osloToken.setSellTaxAddresses(liquidityManagerAddress, investmentEngineAddress);
  await tx.wait();
  console.log("Sell tax addresses set");

  tx = await osloToken.setTaxWhitelist(treasuryAddress, true);
  await tx.wait();
  tx = await osloToken.setTaxWhitelist(liquidityManagerAddress, true);
  await tx.wait();
  tx = await osloToken.setTaxWhitelist(investmentEngineAddress, true);
  await tx.wait();
  tx = await osloToken.setTaxWhitelist(referralAddress, true);
  await tx.wait();
  tx = await osloToken.setTaxWhitelist(osloDEXAddress, true);
  await tx.wait();
  console.log("Protocol contracts whitelisted from sell tax");

  // Mark OSLODEX as sell endpoint
  tx = await osloToken.setSellEndpoint(osloDEXAddress, true);
  await tx.wait();
  console.log("OSLODEX marked as sell endpoint");

  // ─── Step 11: Transfer Token Allocations ──────────────────────────
  console.log("\n--- Step 11: Transferring token allocations ---");

  const CONTRACT_RESERVE = ethers.parseEther("11000000");  // 11,000,000 OSLO to InvestmentEngine
  const DEX_ALLOCATION = ethers.parseEther("100000");        // 100,000 OSLO to LiquidityManager for DEX seed

  const deployerBalance = await osloToken.balanceOf(deployer.address);

  // Transfer 11M to InvestmentEngine (contract reserve)
  tx = await osloToken.transfer(investmentEngineAddress, CONTRACT_RESERVE);
  await tx.wait();
  console.log("Contract reserve transferred to InvestmentEngine:", ethers.formatEther(CONTRACT_RESERVE), "OSLO");

  // Transfer 100K to LiquidityManager for DEX seed
  tx = await osloToken.transfer(liquidityManagerAddress, DEX_ALLOCATION);
  await tx.wait();
  console.log("DEX allocation transferred to LiquidityManager:", ethers.formatEther(DEX_ALLOCATION), "OSLO");

  // ─── Step 12: Register deployer as root referral ──────────────────
  console.log("\n--- Step 12: Registering root referral ---");
  tx = await referral.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Deployer registered as root referral");

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("OSLO Protocol V2 Deployment Complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("OSLOToken:          ", osloAddress);
  console.log("OSLODEX:            ", osloDEXAddress);
  console.log("OSLOTreasury:       ", treasuryAddress);
  console.log("OSLOLiquidityMgr:   ", liquidityManagerAddress);
  console.log("OSLODAO:            ", daoAddress);
  console.log("OSLORankSystem:     ", rankSystemAddress);
  console.log("OSLOReferral:       ", referralAddress);
  console.log("OSLOInvestmentEngine:", investmentEngineAddress);
  console.log("═══════════════════════════════════════════════════════");
  console.log("\nIMPORTANT NEXT STEPS:");
  console.log("1. Deploy Governor + TimelockController");
  console.log("2. Update timelock address in all contracts");
  console.log("3. Call completeSetup() on all contracts");
  console.log("4. Transfer ownership to Timelock");
  console.log("5. Seed DEX with initial USDT liquidity via LiquidityManager.addInitialLiquidity()");
  console.log("6. Verify all contracts on BscScan");
  console.log("═══════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
