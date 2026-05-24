import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const timelockAddress = deployer.address;

  console.log("═".repeat(60));
  console.log("OSLO Protocol V2 — FULL REDEPLOY ($1 reg fee + DEX fix)");
  console.log("═".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  // ─── Step 0: Deploy MockUSDT ───────────────────────────────────────
  console.log("--- Step 0: Deploying MockUSDT ---");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const USDT = await usdt.getAddress();
  console.log("MockUSDT:", USDT);

  // ─── Step 1: Deploy OSLOToken ──────────────────────────────────────
  console.log("\n--- Step 1: Deploying OSLOToken ---");
  const Token = await ethers.getContractFactory("OSLOToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const TOKEN = await token.getAddress();
  console.log("OSLOToken:", TOKEN);

  // ─── Step 2: Deploy OSLODEX (with fixed formulas) ─────────────────
  console.log("\n--- Step 2: Deploying OSLODEX (fixed formulas) ---");
  const DEX = await ethers.getContractFactory("OSLODEX");
  const dex = await DEX.deploy(USDT, TOKEN);
  await dex.waitForDeployment();
  const DEX_ADDR = await dex.getAddress();
  console.log("OSLODEX:", DEX_ADDR);

  // ─── Step 3: Deploy OSLOTreasury ───────────────────────────────────
  console.log("\n--- Step 3: Deploying OSLOTreasury ---");
  const Treasury = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await Treasury.deploy(USDT, TOKEN);
  await treasury.waitForDeployment();
  const TREASURY = await treasury.getAddress();
  console.log("OSLOTreasury:", TREASURY);

  // ─── Step 4: Deploy OSLOLiquidityManager ───────────────────────────
  console.log("\n--- Step 4: Deploying OSLOLiquidityManager ---");
  const LM = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = await LM.deploy(USDT, TOKEN);
  await lm.waitForDeployment();
  const LM_ADDR = await lm.getAddress();
  console.log("OSLOLiquidityManager:", LM_ADDR);

  // ─── Step 5: Deploy OSLODAO ────────────────────────────────────────
  console.log("\n--- Step 5: Deploying OSLODAO ---");
  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(USDT);
  await dao.waitForDeployment();
  const DAO_ADDR = await dao.getAddress();
  console.log("OSLODAO:", DAO_ADDR);

  // ─── Step 6: Deploy OSLORankSystem ─────────────────────────────────
  console.log("\n--- Step 6: Deploying OSLORankSystem ---");
  const RS = await ethers.getContractFactory("OSLORankSystem");
  const rs = await RS.deploy(USDT);
  await rs.waitForDeployment();
  const RS_ADDR = await rs.getAddress();
  console.log("OSLORankSystem:", RS_ADDR);

  // ─── Step 7: Deploy OSLOReferral (V2: $1 fee, needs TOKEN too) ────
  console.log("\n--- Step 7: Deploying OSLOReferral ($1 reg fee) ---");
  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT, TOKEN);
  await ref.waitForDeployment();
  const REF_ADDR = await ref.getAddress();
  console.log("OSLOReferral:", REF_ADDR);

  // ─── Step 8: Deploy OSLOInvestmentEngine ───────────────────────────
  console.log("\n--- Step 8: Deploying OSLOInvestmentEngine ---");
  const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IE.deploy(USDT, TOKEN, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE_ADDR = await ie.getAddress();
  console.log("OSLOInvestmentEngine:", IE_ADDR);

  // ─── Step 9: Wire Cross-Contract Addresses ─────────────────────────
  console.log("\n--- Step 9: Wiring contracts ---");

  let tx = await dex.configure(timelockAddress, LM_ADDR, IE_ADDR);
  await tx.wait();
  console.log("OSLODEX configured (timelock, LM, IE)");

  tx = await treasury.configure(RS_ADDR, DAO_ADDR, LM_ADDR, timelockAddress);
  await tx.wait();
  console.log("Treasury configured (RS, DAO, LM, timelock)");

  tx = await lm.configure(timelockAddress, DEX_ADDR);
  await tx.wait();
  console.log("LiquidityManager configured (timelock, DEX)");

  tx = await dao.configure(timelockAddress, IE_ADDR);
  await tx.wait();
  console.log("DAO configured (timelock, IE)");

  tx = await rs.configure(IE_ADDR, REF_ADDR, timelockAddress);
  await tx.wait();
  console.log("RankSystem configured (IE, Referral, timelock)");

  tx = await ref.configure(IE_ADDR, DEX_ADDR, timelockAddress);
  await tx.wait();
  console.log("Referral configured (IE, DEX, timelock)");

  tx = await ie.configure(TREASURY, REF_ADDR, RS_ADDR, DEX_ADDR, timelockAddress);
  await tx.wait();
  console.log("InvestmentEngine configured (Treasury, Referral, RS, DEX, timelock)");

  // ─── Step 10: Configure OSLOToken ──────────────────────────────────
  console.log("\n--- Step 10: Configuring OSLOToken ---");

  tx = await token.setSellTaxAddresses(LM_ADDR, IE_ADDR);
  await tx.wait();
  console.log("Sell tax → LM");

  tx = await token.setTimelock(timelockAddress);
  await tx.wait();
  console.log("Timelock set on Token");

  const whitelist = [TREASURY, LM_ADDR, IE_ADDR, REF_ADDR, DEX_ADDR];
  for (const addr of whitelist) {
    tx = await token.setTaxWhitelist(addr, true);
    await tx.wait();
  }
  console.log("Protocol contracts whitelisted from sell tax");

  tx = await token.setSellEndpoint(DEX_ADDR, true);
  await tx.wait();
  console.log("OSLODEX marked as sell endpoint");

  // ─── Step 11: Transfer OSLO Allocations ────────────────────────────
  console.log("\n--- Step 11: Transferring OSLO allocations ---");

  const CONTRACT_RESERVE = ethers.parseEther("11000000"); // 11M
  const DEX_ALLOCATION = ethers.parseEther("100000");     // 100K

  tx = await token.transfer(IE_ADDR, CONTRACT_RESERVE);
  await tx.wait();
  console.log("11M OSLO → InvestmentEngine");

  tx = await token.transfer(LM_ADDR, DEX_ALLOCATION);
  await tx.wait();
  console.log("100K OSLO → LiquidityManager");

  // ─── Step 12: Add Initial Liquidity to DEX ─────────────────────────
  console.log("\n--- Step 12: Adding initial DEX liquidity ---");

  let deployerUSDT = await usdt.balanceOf(deployer.address);
  const PAIR_USDT = ethers.parseEther("10000"); // 10K USDT

  if (deployerUSDT < PAIR_USDT) {
    tx = await usdt.mint(deployer.address, PAIR_USDT - deployerUSDT);
    await tx.wait();
    console.log("Minted USDT to deployer");
  }

  tx = await usdt.transfer(LM_ADDR, PAIR_USDT);
  await tx.wait();
  console.log("10K USDT → LiquidityManager");

  tx = await lm.addInitialLiquidity(PAIR_USDT);
  await tx.wait();
  console.log("Initial liquidity added to DEX (10K USDT + 100K OSLO)");

  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("  DEX USDT Reserve:", ethers.formatEther(usdtRes));
  console.log("  DEX OSLO Reserve:", ethers.formatEther(osloRes));
  console.log("  Implied Price:", (Number(usdtRes) / 1e18 / (Number(osloRes) / 1e18)).toFixed(6), "USDT/OSLO");

  // ─── Step 13: Mint test USDT & Register Root ───────────────────────
  console.log("\n--- Step 13: Minting test USDT & registering root ---");

  deployerUSDT = await usdt.balanceOf(deployer.address);
  if (deployerUSDT < ethers.parseEther("20000")) {
    tx = await usdt.mint(deployer.address, ethers.parseEther("20000") - deployerUSDT);
    await tx.wait();
    console.log("Minted USDT up to 20K for deployer");
  }
  console.log("Deployer USDT:", ethers.formatEther(await usdt.balanceOf(deployer.address)));

  // Approve USDT for referral contract ($1 registration fee)
  tx = await usdt.approve(REF_ADDR, ethers.parseEther("1"));
  await tx.wait();
  console.log("Approved $1 USDT for referral registration fee");

  tx = await ref.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Deployer registered as root referral ($1 fee paid → LP)");

  // ─── Summary ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("OSLO Protocol V2 REDEPLOY Complete!");
  console.log("═".repeat(60));
  console.log("MockUSDT:             ", USDT);
  console.log("OSLOToken:            ", TOKEN);
  console.log("OSLODEX (fixed):      ", DEX_ADDR);
  console.log("OSLOTreasury:         ", TREASURY);
  console.log("OSLOLiquidityMgr:     ", LM_ADDR);
  console.log("OSLODAO:              ", DAO_ADDR);
  console.log("OSLORankSystem:       ", RS_ADDR);
  console.log("OSLOReferral ($1 fee):", REF_ADDR);
  console.log("OSLOInvestmentEngine: ", IE_ADDR);
  console.log("═".repeat(60));

  console.log("\n// Frontend CONTRACTS config:");
  console.log("export const CONTRACTS = {");
  console.log(`  osloToken: "${TOKEN}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${IE_ADDR}" as \`0x\${string}\`,`);
  console.log(`  referral: "${REF_ADDR}" as \`0x\${string}\`,`);
  console.log(`  rankSystem: "${RS_ADDR}" as \`0x\${string}\`,`);
  console.log(`  dao: "${DAO_ADDR}" as \`0x\${string}\`,`);
  console.log(`  treasury: "${TREASURY}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager: "${LM_ADDR}" as \`0x\${string}\`,`);
  console.log(`  osloDEX: "${DEX_ADDR}" as \`0x\${string}\`,`);
  console.log(`  usdt: "${USDT}" as \`0x\${string}\`,`);
  console.log("} as const;");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
