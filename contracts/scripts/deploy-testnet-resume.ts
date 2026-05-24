import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

// Addresses from partial deployment (steps 0-6 completed)
const USDT_ADDRESS = "0xdFAff6C92d9d4e0935cAF3429e80C821A044161c";
const osloAddress = "0x203D33abBf8cbb3ce4A8f61Cf13e10394A0bE65C";
const osloDEXAddress = "0x109944D383b476bc7257F68e137D4011E534A34f";
const treasuryAddress = "0x6d4e694fa067A63A17c4187f795f9ED7D1f76810";
const liquidityManagerAddress = "0x80e990fe6C9313c0a4Dbc82Ed28bC88bDf75a279";
const daoAddress = "0xD654c35fAaA33217e55b86c6C1bD4FCCc0B1F05f";
const rankSystemAddress = "0x7f063C8DA2AA9C44fDB92D0346031f873C891811";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Resuming OSLO Protocol V2 TESTNET deployment with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const timelockAddress = deployer.address;

  // ─── Step 7: Deploy OSLOReferral ─────────────────────────────────
  console.log("\n--- Step 7: Deploying OSLOReferral ---");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const referral = await OSLOReferral.deploy(USDT_ADDRESS, osloAddress);
  await referral.waitForDeployment();
  const referralAddress = await referral.getAddress();
  console.log("OSLOReferral deployed to:", referralAddress);

  // ─── Step 8: Deploy OSLOInvestmentEngine ─────────────────────────
  console.log("\n--- Step 8: Deploying OSLOInvestmentEngine ---");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const investmentEngine = await OSLOInvestmentEngine.deploy(USDT_ADDRESS, osloAddress, LAUNCH_TIMESTAMP);
  await investmentEngine.waitForDeployment();
  const investmentEngineAddress = await investmentEngine.getAddress();
  console.log("OSLOInvestmentEngine deployed to:", investmentEngineAddress);

  // ─── Step 9: Wire Cross-Contract Addresses ───────────────────────
  console.log("\n--- Step 9: Wiring contracts together ---");

  // OSLODEX configure
  let tx = await ethers.getContractAt("OSLODEX", osloDEXAddress).then(c =>
    c.configure(timelockAddress, liquidityManagerAddress, investmentEngineAddress)
  );
  await tx.wait();
  console.log("OSLODEX configured");

  // Treasury configure
  tx = await ethers.getContractAt("OSLOTreasury", treasuryAddress).then(c =>
    c.configure(rankSystemAddress, daoAddress, liquidityManagerAddress, timelockAddress)
  );
  await tx.wait();
  console.log("Treasury configured");

  // LiquidityManager configure
  tx = await ethers.getContractAt("OSLOLiquidityManager", liquidityManagerAddress).then(c =>
    c.configure(timelockAddress, osloDEXAddress)
  );
  await tx.wait();
  console.log("LiquidityManager configured");

  // DAO configure
  tx = await ethers.getContractAt("OSLODAO", daoAddress).then(c =>
    c.configure(timelockAddress, investmentEngineAddress)
  );
  await tx.wait();
  console.log("DAO configured");

  // RankSystem configure
  tx = await ethers.getContractAt("OSLORankSystem", rankSystemAddress).then(c =>
    c.configure(investmentEngineAddress, referralAddress, timelockAddress)
  );
  await tx.wait();
  console.log("RankSystem configured");

  // Referral configure
  tx = await referral.configure(investmentEngineAddress, osloDEXAddress, timelockAddress);
  await tx.wait();
  console.log("Referral configured");

  // InvestmentEngine configure
  tx = await investmentEngine.configure(treasuryAddress, referralAddress, rankSystemAddress, osloDEXAddress, timelockAddress);
  await tx.wait();
  console.log("InvestmentEngine configured");

  // ─── Step 10: Token Configuration ────────────────────────────────
  console.log("\n--- Step 10: Configuring OSLOToken ---");

  const osloToken = await ethers.getContractAt("OSLOToken", osloAddress);

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

  // ─── Step 11: Transfer Token Allocations ─────────────────────────
  console.log("\n--- Step 11: Transferring token allocations ---");

  const CONTRACT_RESERVE = ethers.parseEther("11000000");  // 11,000,000 OSLO to InvestmentEngine
  const DEX_ALLOCATION = ethers.parseEther("100000");        // 100,000 OSLO to LiquidityManager for DEX seed

  tx = await osloToken.transfer(investmentEngineAddress, CONTRACT_RESERVE);
  await tx.wait();
  console.log("Contract reserve transferred to InvestmentEngine:", ethers.formatEther(CONTRACT_RESERVE), "OSLO");

  tx = await osloToken.transfer(liquidityManagerAddress, DEX_ALLOCATION);
  await tx.wait();
  console.log("DEX allocation transferred to LiquidityManager:", ethers.formatEther(DEX_ALLOCATION), "OSLO");

  // ─── Step 12: Mint test USDT ─────────────────────────────────────
  console.log("\n--- Step 12: Minting test USDT ---");
  const mockUSDT = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
  await tx.wait();
  console.log("Minted 10,000 USDT to deployer for testing");

  // ─── Step 13: Register deployer as root referral ─────────────────
  console.log("\n--- Step 13: Registering root referral ---");
  tx = await referral.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Deployer registered as root referral");

  // ─── Summary ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("OSLO Protocol V2 TESTNET Deployment Complete!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("MockUSDT:            ", USDT_ADDRESS);
  console.log("OSLOToken:           ", osloAddress);
  console.log("OSLODEX:             ", osloDEXAddress);
  console.log("OSLOTreasury:        ", treasuryAddress);
  console.log("OSLOLiquidityMgr:    ", liquidityManagerAddress);
  console.log("OSLODAO:             ", daoAddress);
  console.log("OSLORankSystem:      ", rankSystemAddress);
  console.log("OSLOReferral:        ", referralAddress);
  console.log("OSLOInvestmentEngine:", investmentEngineAddress);
  console.log("═══════════════════════════════════════════════════════════");

  // Output for easy copy-paste into frontend config
  console.log("\n// Frontend CONTRACTS config:");
  console.log(`export const CONTRACTS = {`);
  console.log(`  osloToken: "${osloAddress}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${investmentEngineAddress}" as \`0x\${string}\`,`);
  console.log(`  referral: "${referralAddress}" as \`0x\${string}\`,`);
  console.log(`  rankSystem: "${rankSystemAddress}" as \`0x\${string}\`,`);
  console.log(`  dao: "${daoAddress}" as \`0x\${string}\`,`);
  console.log(`  treasury: "${treasuryAddress}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager: "${liquidityManagerAddress}" as \`0x\${string}\`,`);
  console.log(`  osloDEX: "${osloDEXAddress}" as \`0x\${string}\`,`);
  console.log(`  usdt: "${USDT_ADDRESS}" as \`0x\${string}\`,`);
  console.log(`} as const;`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
