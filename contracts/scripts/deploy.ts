import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Launch timestamp: set to current deployment time (no fixed date)
const LAUNCH_TIMESTAMP = Math.floor(Date.now() / 1000);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OSLO Protocol (BSC MAINNET) with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // ─── Configuration ─────────────────────────────────────────────────
  // BSC Mainnet USDT (BEP-20)
  const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

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

  // Referral configure (3 args: investmentEngine, osloDex, timelock)
  tx = await referral.configure(investmentEngineAddress, osloDEXAddress, timelockAddress);
  await tx.wait();
  console.log("Referral configured");

  // InvestmentEngine configure
  tx = await investmentEngine.configure(treasuryAddress, referralAddress, rankSystemAddress, osloDEXAddress, timelockAddress);
  await tx.wait();
  console.log("InvestmentEngine configured");

  // ─── Step 10: Token Configuration ─────────────────────────────────
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
  const DEX_ALLOCATION = ethers.parseEther("100000");      // 100,000 OSLO to LiquidityManager for DEX seed

  // Transfer 11M to InvestmentEngine (contract reserve)
  tx = await osloToken.transfer(investmentEngineAddress, CONTRACT_RESERVE);
  await tx.wait();
  console.log("Contract reserve transferred to InvestmentEngine:", ethers.formatEther(CONTRACT_RESERVE), "OSLO");

  // Transfer 100K to LiquidityManager for DEX seed
  tx = await osloToken.transfer(liquidityManagerAddress, DEX_ALLOCATION);
  await tx.wait();
  console.log("DEX allocation transferred to LiquidityManager:", ethers.formatEther(DEX_ALLOCATION), "OSLO");

  // ─── Step 12: Set Reward Wallets ─────────────────────────────────
  console.log("\n--- Step 12: Setting reward wallets (2% deposit fee split) ---");
  const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";      // 1.0%
  const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";     // 0.5%
  const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9"; // 0.5%
  
  tx = await investmentEngine.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
  await tx.wait();
  console.log("  Reward wallet (1.0%):", REWARD_WALLET);
  console.log("  Company wallet (0.5%):", COMPANY_WALLET);
  console.log("  Performance wallet (0.5%):", PERFORMANCE_WALLET);

  // ─── Step 13: Seed DEX Liquidity ──────────────────────────────────
  console.log("\n--- Step 13: Seeding DEX Liquidity ---");
  const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);

  // Check if LiquidityManager already has USDT (user may have sent directly)
  let lmUsdtBalance = await usdt.balanceOf(liquidityManagerAddress);
  
  // If not, check deployer balance and transfer
  if (lmUsdtBalance === 0n) {
    const deployerUsdtBalance = await usdt.balanceOf(deployer.address);
    if (deployerUsdtBalance > 0n) {
      tx = await usdt.transfer(liquidityManagerAddress, deployerUsdtBalance);
      await tx.wait();
      lmUsdtBalance = deployerUsdtBalance;
      console.log(`  Transferred ${ethers.formatEther(lmUsdtBalance)} USDT from deployer to LiquidityManager`);
    }
  } else {
    console.log(`  LiquidityManager already has ${ethers.formatEther(lmUsdtBalance)} USDT`);
  }

  if (lmUsdtBalance > 0n) {
    tx = await liquidityManager.addInitialLiquidity(lmUsdtBalance);
    await tx.wait();
    console.log(`  DEX seeded with ${ethers.formatEther(lmUsdtBalance)} USDT + 100K OSLO`);
  } else {
    console.log("  WARNING: No USDT available. DEX NOT seeded yet.");
    console.log("  Send USDT to deployer, then run: npx hardhat run scripts/seed-liquidity.ts --network bscMainnet");
    console.log("  LiquidityManager:", liquidityManagerAddress);
  }

  // ─── Step 14: Migrate Testnet Users ───────────────────────────────
  console.log("\n--- Step 14: Migrating Testnet Users ---");
  const snapshotPath = path.join(__dirname, "..", "data", "testnet-snapshot.json");

  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const users = snapshot.users as { address: string; referrer: string; unlockedLevels: number }[];

    if (users.length > 0) {
      // Batch in chunks of 50 to avoid gas limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const addresses = batch.map((u) => u.address);
        const referrers = batch.map((u) => u.referrer);
        const levels = batch.map((u) => u.unlockedLevels);

        tx = await referral.migrateUsers(addresses, referrers, levels);
        await tx.wait();
        console.log(`  Migrated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} users`);
      }
      console.log(`Total migrated: ${users.length} users`);
    }

    // ─── Step 14b: Migrate Testnet Deposits ───────────────────────────
    type SnapshotDeposit = {
      owner: string; index: number; amount: string; tier: number;
      dailyRate: number; depositTime: number; lastClaimTime: number;
      totalClaimed: string; maxReturn: string; active: boolean;
    };
    const deposits = (snapshot.deposits || []) as SnapshotDeposit[];
    const activeDeposits = deposits.filter((d: SnapshotDeposit) => d.active);

    if (activeDeposits.length > 0) {
      console.log(`\n--- Step 14b: Migrating ${activeDeposits.length} Testnet Deposits ---`);
      const DEP_BATCH = 20; // smaller batch due to more calldata
      for (let i = 0; i < activeDeposits.length; i += DEP_BATCH) {
        const batch = activeDeposits.slice(i, i + DEP_BATCH);
        const entries = batch.map((d: SnapshotDeposit) => ({
          owner:        d.owner,
          amount:       ethers.parseEther(d.amount),
          tier:         BigInt(d.tier),
          dailyRate:    BigInt(d.dailyRate),
          depositTime:  BigInt(d.depositTime),
          lastClaimTime: BigInt(d.lastClaimTime),
          totalClaimed: ethers.parseEther(d.totalClaimed),
          maxReturn:    ethers.parseEther(d.maxReturn),
        }));

        tx = await investmentEngine.migrateDeposits(entries);
        await tx.wait();
        console.log(`  Migrated deposit batch ${Math.floor(i / DEP_BATCH) + 1}: ${batch.length} deposits`);
      }
      console.log(`Total migrated deposits: ${activeDeposits.length}`);
    }
  } else {
    console.log("  No snapshot file found at", snapshotPath);
    console.log("  Registering deployer as root referral instead...");
    tx = await referral.register(deployer.address, ethers.ZeroAddress);
    await tx.wait();
    console.log("  Deployer registered as root referral");
  }

  // ─── Step 15: Complete Setup (SKIPPED - keeping admin for testing) ─
  console.log("\n--- Step 15: Setup Finalization (SKIPPED) ---");
  console.log("  Admin retained for testing. Run finalize-setup.ts when ready to lock down.");

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n=====================================================");
  console.log("OSLO Protocol MAINNET Deployment Complete!");
  console.log("=====================================================");
  console.log("USDT (BEP-20):       ", USDT_ADDRESS);
  console.log("OSLOToken:           ", osloAddress);
  console.log("OSLODEX:             ", osloDEXAddress);
  console.log("OSLOTreasury:        ", treasuryAddress);
  console.log("OSLOLiquidityMgr:    ", liquidityManagerAddress);
  console.log("OSLODAO:             ", daoAddress);
  console.log("OSLORankSystem:      ", rankSystemAddress);
  console.log("OSLOReferral:        ", referralAddress);
  console.log("OSLOInvestmentEngine:", investmentEngineAddress);
  console.log("=====================================================");

  // Save addresses to file for other scripts
  const addresses = {
    network: "bscMainnet",
    chainId: 56,
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
  const addrPath = path.join(__dirname, "..", "data", "mainnet-addresses.json");
  fs.writeFileSync(addrPath, JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to:", addrPath);

  console.log("\nNEXT STEPS:");
  console.log("1. Send 1000 USDT to deployer, then run: npx hardhat run scripts/seed-liquidity.ts --network bscMainnet");
  console.log("2. Update frontend/src/lib/contracts.ts with above addresses");
  console.log("3. Update subgraph/subgraph.yaml with above addresses + startBlock");
  console.log("4. Verify all contracts on BscScan:");
  console.log("   npx hardhat verify --network bscMainnet <address> <constructor args>");
  console.log("5. Rebuild and deploy frontend");
  console.log("=====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
