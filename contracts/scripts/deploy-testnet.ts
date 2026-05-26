import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OSLO Protocol V2 (TESTNET) with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // ─── Step 0: Deploy MockUSDT ──────────────────────────────────────
  console.log("\n--- Step 0: Deploying MockUSDT (Test Token) ---");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  const USDT_ADDRESS = await mockUSDT.getAddress();
  console.log("MockUSDT deployed to:", USDT_ADDRESS);

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
  const referral = await OSLOReferral.deploy(USDT_ADDRESS, osloAddress);
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

  // Set referral contract on DEX (CRITICAL: required for registration fee injection)
  tx = await osloDEX.forceSetReferralContract(referralAddress);
  await tx.wait();
  console.log("OSLODEX referral contract set");

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
  tx = await referral.configure(investmentEngineAddress, osloDEXAddress, timelockAddress);
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

  // Transfer 11M to InvestmentEngine (contract reserve)
  tx = await osloToken.transfer(investmentEngineAddress, CONTRACT_RESERVE);
  await tx.wait();
  console.log("Contract reserve transferred to InvestmentEngine:", ethers.formatEther(CONTRACT_RESERVE), "OSLO");

  // Transfer 100K to LiquidityManager for DEX seed
  tx = await osloToken.transfer(liquidityManagerAddress, DEX_ALLOCATION);
  await tx.wait();
  console.log("DEX allocation transferred to LiquidityManager:", ethers.formatEther(DEX_ALLOCATION), "OSLO");

  // ─── Step 11b: Set Reward Wallets ───────────────────────────────
  console.log("\n--- Step 11b: Setting reward wallets (2% deposit fee split) ---");
  const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
  const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
  const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";
  tx = await investmentEngine.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
  await tx.wait();
  console.log("  Reward wallet (1.0%):", REWARD_WALLET);
  console.log("  Company wallet (0.5%):", COMPANY_WALLET);
  console.log("  Performance wallet (0.5%):", PERFORMANCE_WALLET);

  // ─── Step 12: Mint test USDT ──────────────────────────────────────
  console.log("\n--- Step 12: Minting test USDT ---");
  tx = await mockUSDT.mint(deployer.address, ethers.parseEther("10000"));
  await tx.wait();
  console.log("Minted 10,000 USDT to deployer for testing");

  // ─── Step 12b: Seed DEX with initial liquidity ────────────────────
  console.log("\n--- Step 12b: Seeding DEX with initial liquidity ---");
  const seedUSDT = ethers.parseEther("1000");
  tx = await mockUSDT.transfer(liquidityManagerAddress, seedUSDT);
  await tx.wait();
  console.log("Transferred", ethers.formatEther(seedUSDT), "USDT to LiquidityManager");
  tx = await liquidityManager.addInitialLiquidity(seedUSDT);
  await tx.wait();
  const [dexUsdt, dexOslo] = await osloDEX.getReserves();
  console.log("DEX seeded:", ethers.formatEther(dexUsdt), "USDT +", ethers.formatEther(dexOslo), "OSLO");

  // ─── Step 13: Register deployer as root referral ──────────────────
  console.log("\n--- Step 13: Registering root referral ---");
  tx = await mockUSDT.approve(referralAddress, ethers.parseEther("1"));
  await tx.wait();
  console.log("USDT approved for referral registration");
  tx = await referral.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Deployer registered as root referral");

  // ─── Summary ──────────────────────────────────────────────────────
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

  // Save addresses to file
  const addresses = {
    network: "bscTestnet",
    chainId: 97,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    USDT: USDT_ADDRESS,
    OSLOToken: osloAddress,
    OSLODEX: osloDEXAddress,
    OSLOTreasury: treasuryAddress,
    OSLOLiquidityManager: liquidityManagerAddress,
    OSLODAO: daoAddress,
    OSLORankSystem: rankSystemAddress,
    OSLOReferral: referralAddress,
    OSLOInvestmentEngine: investmentEngineAddress,
  };
  const addrPath = path.join(__dirname, "..", "data", "testnet-addresses.json");
  fs.mkdirSync(path.dirname(addrPath), { recursive: true });
  fs.writeFileSync(addrPath, JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to:", addrPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
