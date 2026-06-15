/**
 * Redeploy All Fixed Contracts on Testnet
 * 
 * This script deploys ALL contracts with the forceApprove → approve fix
 * for testnet testing purposes only.
 * 
 * ⚠️  DOES NOT affect mainnet
 * ✅ Safe to run - testnet only
 * 
 * Run: npx hardhat run scripts/redeploy-all-testnet.ts --network bscTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  console.log("🚀 Redeploying All Fixed Contracts on Testnet\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("⚠️  This is TESTNET ONLY - Mainnet is NOT affected\n");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  const network = await ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name, `(${network.chainId})`);

  if (network.chainId !== 97n) {
    console.error("\n❌ ERROR: This script is for BSC Testnet only!");
    console.error("   Current chain ID:", network.chainId.toString());
    console.error("   Expected: 97 (BSC Testnet)");
    process.exit(1);
  }
  console.log("✅ Correct network\n");

  // Load existing addresses
  const existingAddresses = JSON.parse(
    fs.readFileSync("data/testnet-addresses.json", "utf8")
  );

  const USDT_ADDRESS = existingAddresses.USDT;
  const OSLO_TOKEN_ADDRESS = existingAddresses.OSLOToken;

  console.log("📋 Using Existing Tokens:");
  console.log("  USDT (Mock):", USDT_ADDRESS);
  console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
  console.log("");

  const deployed: Record<string, string> = {};

  // ─── Step 1: Deploy OSLODEX ─────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 1: Deploying OSLODEX");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLODEX = await ethers.getContractFactory("OSLODEX");
  const dex = await OSLODEX.deploy(USDT_ADDRESS, OSLO_TOKEN_ADDRESS);
  await dex.waitForDeployment();
  const dexAddress = await dex.getAddress();
  deployed.OSLODEX = dexAddress;
  console.log("✅ OSLODEX deployed:", dexAddress);

  // ─── Step 2: Deploy OSLOInvestmentEngine ────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 2: Deploying OSLOInvestmentEngine");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const launchTimestamp = Math.floor(Date.now() / 1000);
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const investmentEngine = await OSLOInvestmentEngine.deploy(
    USDT_ADDRESS,
    OSLO_TOKEN_ADDRESS,
    launchTimestamp
  );
  await investmentEngine.waitForDeployment();
  const ieAddress = await investmentEngine.getAddress();
  deployed.OSLOInvestmentEngine = ieAddress;
  console.log("✅ OSLOInvestmentEngine deployed:", ieAddress);

  // ─── Step 3: Deploy OSLOVault (USDT Vault) ─────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 3: Deploying OSLOVault (USDT Vault)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLOVault = await ethers.getContractFactory("OSLOVault");
  const usdtVault = await OSLOVault.deploy(
    USDT_ADDRESS,
    OSLO_TOKEN_ADDRESS,
    launchTimestamp
  );
  await usdtVault.waitForDeployment();
  const usdtVaultAddress = await usdtVault.getAddress();
  deployed.OSLOVault_USDT = usdtVaultAddress;
  console.log("✅ OSLOVault (USDT) deployed:", usdtVaultAddress);

  // ─── Step 4: Deploy OSLOVault (OSLO Vault) ─────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 4: Deploying OSLOVault (OSLO Vault)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const osloVault = await OSLOVault.deploy(
    OSLO_TOKEN_ADDRESS,
    USDT_ADDRESS,
    launchTimestamp
  );
  await osloVault.waitForDeployment();
  const osloVaultAddress = await osloVault.getAddress();
  deployed.OSLOVault_OSLO = osloVaultAddress;
  console.log("✅ OSLOVault (OSLO) deployed:", osloVaultAddress);

  // ─── Step 5: Deploy OSLOTreasury ────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 5: Deploying OSLOTreasury");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLOTreasury = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await OSLOTreasury.deploy(USDT_ADDRESS, OSLO_TOKEN_ADDRESS);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  deployed.OSLOTreasury = treasuryAddress;
  console.log("✅ OSLOTreasury deployed:", treasuryAddress);

  // ─── Step 6: Deploy FeeRouter ───────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 6: Deploying FeeRouter");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(USDT_ADDRESS, dexAddress);
  await feeRouter.waitForDeployment();
  const feeRouterAddress = await feeRouter.getAddress();
  deployed.FeeRouter = feeRouterAddress;
  console.log("✅ FeeRouter deployed:", feeRouterAddress);

  // ─── Step 7: Deploy OSLOReferral ────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 Step 7: Deploying OSLOReferral");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const referral = await OSLOReferral.deploy(
    USDT_ADDRESS,
    OSLO_TOKEN_ADDRESS,
    feeRouterAddress,
    deployer.address
  );
  await referral.waitForDeployment();
  const referralAddress = await referral.getAddress();
  deployed.OSLOReferral = referralAddress;
  console.log("✅ OSLOReferral deployed:", referralAddress);

  // ─── Step 8: Configure Contracts ────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚙️ Step 8: Configuring Contracts");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Configure InvestmentEngine
  console.log("⚙️ Configuring InvestmentEngine...");
  const ieConfigTx = await investmentEngine.completeSetup(
    referralAddress,
    dexAddress,
    feeRouterAddress,
    treasuryAddress,
    usdtVaultAddress,
    deployer.address
  );
  await ieConfigTx.wait();
  console.log("✅ InvestmentEngine configured\n");

  // Configure Vaults
  console.log("⚙️ Configuring USDT Vault...");
  const usdtVaultConfigTx = await usdtVault.configure(
    dexAddress,
    referralAddress,
    "0x0000000000000000000000000000000000000000", // No rank system
    deployer.address // timelock = deployer for now
  );
  await usdtVaultConfigTx.wait();
  console.log("✅ USDT Vault configured");

  console.log("⚙️ Configuring OSLO Vault...");
  const osloVaultConfigTx = await osloVault.configure(
    dexAddress,
    referralAddress,
    "0x0000000000000000000000000000000000000000", // No rank system
    deployer.address // timelock = deployer for now
  );
  await osloVaultConfigTx.wait();
  console.log("✅ OSLO Vault configured\n");

  // Configure DEX
  console.log("⚙️ Configuring DEX...");
  const dexConfigTx1 = await dex.setFeeRouter(feeRouterAddress);
  await dexConfigTx1.wait();
  console.log("✅ DEX fee router set");

  const dexConfigTx2 = await dex.setInvestmentEngine(ieAddress);
  await dexConfigTx2.wait();
  console.log("✅ DEX investment engine set");

  const dexConfigTx3 = await dex.setTreasury(treasuryAddress);
  await dexConfigTx3.wait();
  console.log("✅ DEX treasury set\n");

  // Configure Treasury
  console.log("⚙️ Configuring Treasury...");
  const treasuryConfigTx = await treasury.configure(
    "0x0000000000000000000000000000000000000000", // rankSystem (not used yet)
    dexAddress,
    ieAddress,
    "0x0000000000000000000000000000000000000000", // timelock (not set yet)
    feeRouterAddress
  );
  await treasuryConfigTx.wait();
  console.log("✅ Treasury configured\n");

  // ─── Step 9: Fund and Seed Liquidity ────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💰 Step 9: Funding Contracts & Seeding Liquidity");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Get some USDT for deployer
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, deployer);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN_ADDRESS, deployer);

  console.log("💰 Transferring USDT to deployer...");
  const usdtTransfer = await mockUSDT.transfer(deployer.address, ethers.parseEther("1000000"));
  await usdtTransfer.wait();
  console.log("✅ Deployer received 1M USDT\n");

  // Approve DEX
  console.log("📝 Approving DEX...");
  const dexUsdtApprove = await mockUSDT.approve(dexAddress, ethers.parseEther("5000"));
  await dexUsdtApprove.wait();
  const dexOsloApprove = await osloToken.approve(dexAddress, ethers.parseEther("100000"));
  await dexOsloApprove.wait();
  console.log("✅ Approvals done\n");

  // Add liquidity to DEX
  console.log("🌊 Adding liquidity to DEX...");
  const addLiquidityTx = await dex.addInitialLiquidity(
    ethers.parseEther("5000"),
    ethers.parseEther("100000")
  );
  await addLiquidityTx.wait();
  console.log("✅ Liquidity added: 5,000 USDT + 100,000 OSLO\n");

  // ─── Step 10: Fund Referral Contract ────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💰 Step 10: Funding Referral Contract");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("💰 Transferring USDT to referral...");
  const referralUsdtTransfer = await mockUSDT.transfer(referralAddress, ethers.parseEther("50000"));
  await referralUsdtTransfer.wait();
  console.log("✅ Referral received 50K USDT");

  console.log("💰 Transferring OSLO to referral...");
  const referralOsloTransfer = await osloToken.transfer(referralAddress, ethers.parseEther("500000"));
  await referralOsloTransfer.wait();
  console.log("✅ Referral received 500K OSLO\n");

  // ─── Step 11: Set Reward Wallets ───────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👥 Step 11: Setting Reward Wallets");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const wallet1 = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const wallet2 = "0x829BD824B016326A401d083B33D092293333A830";

  console.log("👥 Setting referral reward wallets...");
  const setRewardsTx = await referral.setRewardWallets([wallet1, wallet2]);
  await setRewardsTx.wait();
  console.log("✅ Reward wallets set:", wallet1, wallet2);

  console.log("\n👥 Setting fee router reward wallets...");
  const setFeeRewardsTx = await feeRouter.setRewardWallet([wallet1, wallet2]);
  await setFeeRewardsTx.wait();
  console.log("✅ Fee router reward wallets set\n");

  // ─── Step 12: Save Addresses ────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💾 Step 12: Saving Addresses");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const newAddresses = {
    USDT: USDT_ADDRESS,
    OSLOToken: OSLO_TOKEN_ADDRESS,
    OSLODEX: dexAddress,
    OSLOInvestmentEngine: ieAddress,
    OSLOVault_USDT: usdtVaultAddress,
    OSLOVault_OSLO: osloVaultAddress,
    OSLOTreasury: treasuryAddress,
    FeeRouter: feeRouterAddress,
    OSLOReferral: referralAddress,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    "data/testnet-new-addresses.json",
    JSON.stringify(newAddresses, null, 2)
  );
  console.log("✅ Addresses saved to data/testnet-new-addresses.json\n");

  // ─── Final Summary ──────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("📋 Contract Addresses:");
  console.log("━".repeat(70));
  console.log("USDT (Mock):         ", USDT_ADDRESS);
  console.log("OSLOToken:           ", OSLO_TOKEN_ADDRESS);
  console.log("OSLODEX:             ", dexAddress);
  console.log("OSLOInvestmentEngine:", ieAddress);
  console.log("OSLOVault (USDT):    ", usdtVaultAddress);
  console.log("OSLOVault (OSLO):    ", osloVaultAddress);
  console.log("OSLOTreasury:        ", treasuryAddress);
  console.log("FeeRouter:           ", feeRouterAddress);
  console.log("OSLOReferral:        ", referralAddress);
  console.log("━".repeat(70));
  console.log("");
  console.log("💡 Next Steps:");
  console.log("  1. Update frontend/src/lib/contracts-testnet.ts with new addresses");
  console.log("  2. Test registration flow");
  console.log("  3. Test deposit flow");
  console.log("  4. Run: npx hardhat run scripts/deposit-and-debug.ts --network bscTestnet");
  console.log("");
  console.log("⚠️  Mainnet contracts are NOT affected");
  console.log("✅ All contracts deployed with forceApprove → approve fix");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
