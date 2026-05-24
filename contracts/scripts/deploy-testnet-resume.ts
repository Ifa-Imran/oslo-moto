import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

// Already deployed in previous run (Step 0-3):
const USDT_ADDRESS = "0x604544CB446D4eEa0A4Fb948312B019215915007";
const OSLO_ADDRESS = "0x374111392aEA529e5c7ECFd4a6CCFECca0a44DEB";
const DEX_ADDRESS = "0xEBe104F0A05B643B0340fCb655da33BB1031C0D9";
const TREASURY_ADDRESS = "0xe249236f91be1Db221c9326b26fceF2aD6A15fF3";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Resuming OSLO Protocol V2 TESTNET deploy with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  const timelockAddress = deployer.address;

  const mockUSDT = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_ADDRESS);
  const osloDEX = await ethers.getContractAt("OSLODEX", DEX_ADDRESS);
  const treasury = await ethers.getContractAt("OSLOTreasury", TREASURY_ADDRESS);

  // ─── Step 4: Deploy LiquidityManager ──────────────────────────────
  console.log("--- Step 4: Deploying OSLOLiquidityManager ---");
  const LM = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = await LM.deploy(USDT_ADDRESS, OSLO_ADDRESS);
  await lm.waitForDeployment();
  const LM_ADDRESS = await lm.getAddress();
  console.log("OSLOLiquidityManager deployed to:", LM_ADDRESS);

  // ─── Step 5: Deploy DAO ───────────────────────────────────────────
  console.log("\n--- Step 5: Deploying OSLODAO ---");
  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(USDT_ADDRESS);
  await dao.waitForDeployment();
  const DAO_ADDRESS = await dao.getAddress();
  console.log("OSLODAO deployed to:", DAO_ADDRESS);

  // ─── Step 6: Deploy RankSystem ────────────────────────────────────
  console.log("\n--- Step 6: Deploying OSLORankSystem ---");
  const RS = await ethers.getContractFactory("OSLORankSystem");
  const rs = await RS.deploy(USDT_ADDRESS);
  await rs.waitForDeployment();
  const RS_ADDRESS = await rs.getAddress();
  console.log("OSLORankSystem deployed to:", RS_ADDRESS);

  // ─── Step 7: Deploy Referral ──────────────────────────────────────
  console.log("\n--- Step 7: Deploying OSLOReferral ---");
  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT_ADDRESS);
  await ref.waitForDeployment();
  const REF_ADDRESS = await ref.getAddress();
  console.log("OSLOReferral deployed to:", REF_ADDRESS);

  // ─── Step 8: Deploy InvestmentEngine ──────────────────────────────
  console.log("\n--- Step 8: Deploying OSLOInvestmentEngine ---");
  const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IE.deploy(USDT_ADDRESS, OSLO_ADDRESS, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE_ADDRESS = await ie.getAddress();
  console.log("OSLOInvestmentEngine deployed to:", IE_ADDRESS);

  // ─── Step 9: Wire Cross-Contract Addresses ────────────────────────
  console.log("\n--- Step 9: Wiring contracts together ---");

  let tx = await osloDEX.configure(timelockAddress, LM_ADDRESS, IE_ADDRESS);
  await tx.wait();
  console.log("OSLODEX configured");

  tx = await treasury.configure(RS_ADDRESS, DAO_ADDRESS, LM_ADDRESS, timelockAddress);
  await tx.wait();
  console.log("Treasury configured");

  tx = await lm.configure(timelockAddress, DEX_ADDRESS);
  await tx.wait();
  console.log("LiquidityManager configured");

  tx = await dao.configure(timelockAddress, IE_ADDRESS);
  await tx.wait();
  console.log("DAO configured");

  tx = await rs.configure(IE_ADDRESS, REF_ADDRESS, timelockAddress);
  await tx.wait();
  console.log("RankSystem configured");

  tx = await ref.configure(IE_ADDRESS, timelockAddress);
  await tx.wait();
  console.log("Referral configured");

  tx = await ie.configure(TREASURY_ADDRESS, REF_ADDRESS, RS_ADDRESS, DEX_ADDRESS, timelockAddress);
  await tx.wait();
  console.log("InvestmentEngine configured");

  // ─── Step 10: Token Configuration ─────────────────────────────────
  console.log("\n--- Step 10: Configuring OSLOToken ---");

  tx = await osloToken.setSellTaxAddresses(LM_ADDRESS);
  await tx.wait();
  console.log("Sell tax addresses set");

  const whitelistTargets = [TREASURY_ADDRESS, LM_ADDRESS, IE_ADDRESS, REF_ADDRESS, DEX_ADDRESS];
  for (const addr of whitelistTargets) {
    tx = await osloToken.setTaxWhitelist(addr, true);
    await tx.wait();
  }
  console.log("Protocol contracts whitelisted from sell tax");

  tx = await osloToken.setSellEndpoint(DEX_ADDRESS, true);
  await tx.wait();
  console.log("OSLODEX marked as sell endpoint");

  // ─── Step 11: Transfer Token Allocations ──────────────────────────
  console.log("\n--- Step 11: Transferring token allocations ---");

  const CONTRACT_RESERVE = ethers.parseEther("11000000");
  const DEX_ALLOCATION = ethers.parseEther("100000");

  tx = await osloToken.transfer(IE_ADDRESS, CONTRACT_RESERVE);
  await tx.wait();
  console.log("Contract reserve (11M OSLO) → InvestmentEngine");

  tx = await osloToken.transfer(LM_ADDRESS, DEX_ALLOCATION);
  await tx.wait();
  console.log("DEX allocation (100K OSLO) → LiquidityManager");

  // ─── Step 12: Mint test USDT ──────────────────────────────────────
  console.log("\n--- Step 12: Minting test USDT ---");
  tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
  await tx.wait();
  console.log("Minted 10,000 USDT to deployer");

  // ─── Step 13: Register deployer as root referral ──────────────────
  console.log("\n--- Step 13: Registering root referral ---");
  tx = await ref.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Deployer registered as root referral");

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("OSLO Protocol V2 TESTNET Deployment Complete!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("MockUSDT:            ", USDT_ADDRESS);
  console.log("OSLOToken:           ", OSLO_ADDRESS);
  console.log("OSLODEX:             ", DEX_ADDRESS);
  console.log("OSLOTreasury:        ", TREASURY_ADDRESS);
  console.log("OSLOLiquidityMgr:    ", LM_ADDRESS);
  console.log("OSLODAO:             ", DAO_ADDRESS);
  console.log("OSLORankSystem:      ", RS_ADDRESS);
  console.log("OSLOReferral:        ", REF_ADDRESS);
  console.log("OSLOInvestmentEngine:", IE_ADDRESS);
  console.log("═══════════════════════════════════════════════════════════");

  console.log("\n// Frontend CONTRACTS config:");
  console.log(`export const CONTRACTS = {`);
  console.log(`  osloToken: "${OSLO_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${IE_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  referral: "${REF_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  rankSystem: "${RS_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  dao: "${DAO_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  treasury: "${TREASURY_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager: "${LM_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  osloDEX: "${DEX_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`  usdt: "${USDT_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`} as const;`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
