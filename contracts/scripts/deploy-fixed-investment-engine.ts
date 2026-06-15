import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying Fixed InvestmentEngine Contract\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Deployer BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Contract addresses from testnet-v4
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const OSLO_VAULT_ADDRESS = "0xe188afCb1Dacd30Ca8BbF5F69dBf64b08b0136B8";
  const OSLODEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const FEE_ROUTER_ADDRESS = "0x25202935cBa1D874699542f33F31C3579f7671da"; // V2
  const TIMELOCK_ADDRESS = "0x47f8160e3C854b4b4679579b99726E5E81736B7f"; // Deployer
  const REFERRAL_ADDRESS = "0x0D584e91182a91e0500db20a603D0f732bE01B12"; // New fixed referral

  console.log("📋 Dependencies:");
  console.log("  USDT:", USDT_ADDRESS);
  console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
  console.log("  OSLO Vault:", OSLO_VAULT_ADDRESS);
  console.log("  OSLODEX:", OSLODEX_ADDRESS);
  console.log("  Fee Router:", FEE_ROUTER_ADDRESS);
  console.log("  Timelock:", TIMELOCK_ADDRESS);
  console.log("  Referral:", REFERRAL_ADDRESS);
  console.log("");

  // Step 1: Deploy new InvestmentEngine
  console.log("📦 Step 1: Deploying OSLOInvestmentEngine...\n");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const launchTimestamp = Math.floor(Date.now() / 1000); // Current timestamp
  const newIE = await OSLOInvestmentEngine.deploy(
    USDT_ADDRESS,
    OSLO_TOKEN_ADDRESS,
    launchTimestamp
  );
  await newIE.waitForDeployment();
  const newIEAddress = await newIE.getAddress();
  console.log("✅ New InvestmentEngine deployed:", newIEAddress);
  console.log("");

  // Step 2: Configure InvestmentEngine
  console.log("⚙️ Step 2: Configuring InvestmentEngine...\n");
  
  console.log("  Configuring core contracts...");
  const configureTx = await newIE.configure(
    OSLO_VAULT_ADDRESS,  // treasury
    REFERRAL_ADDRESS,    // referral
    ethers.ZeroAddress,  // rankSystem (not used yet)
    OSLODEX_ADDRESS,     // osloDex
    TIMELOCK_ADDRESS     // timelock
  );
  await configureTx.wait();
  console.log("  ✅ Core contracts configured\n");

  console.log("  Setting reward wallets...");
  const rewardWallet = deployer.address; // Use deployer as reward wallet for testing
  const companyWallet = deployer.address;
  const performanceWallet = deployer.address;
  const setWalletsTx = await newIE.setRewardWallets(rewardWallet, companyWallet, performanceWallet);
  await setWalletsTx.wait();
  console.log("  ✅ Reward wallets set\n");

  // Step 3: Complete setup (unpauses deposits)
  console.log("🔓 Step 3: Completing setup...\n");
  const completeSetupTx = await newIE.completeSetup();
  await completeSetupTx.wait();
  console.log("  ✅ Setup complete (deposits unpaused)\n");

  // Step 4: Transfer OSLO tokens to InvestmentEngine for DEX reserve
  console.log("💰 Step 4: Funding InvestmentEngine with OSLO...\n");
  const osloToken = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", OSLO_TOKEN_ADDRESS);
  const deployerOsloBalance = await osloToken.balanceOf(deployer.address);
  console.log("  Deployer OSLO balance:", ethers.formatEther(deployerOsloBalance));
  
  // Transfer 5M OSLO to InvestmentEngine for reserve
  const transferAmount = ethers.parseEther("5000000");
  if (deployerOsloBalance >= transferAmount) {
    const transferTx = await osloToken.transfer(newIEAddress, transferAmount);
    await transferTx.wait();
    console.log("  ✅ Transferred 5,000,000 OSLO to InvestmentEngine\n");
  } else {
    console.log("  ⚠️ Insufficient OSLO balance, skipping transfer\n");
  }

  // Step 5: Test deposit with wallet
  console.log("🧪 Step 5: Testing deposit with wallet...\n");
  const WALLET_ADDRESS = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const PRIVATE_KEY = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  const wallet = new ethers.Wallet(PRIVATE_KEY).connect(ethers.provider);

  console.log("  Wallet:", WALLET_ADDRESS);
  console.log("  Wallet BNB:", ethers.formatEther(await ethers.provider.getBalance(WALLET_ADDRESS)), "BNB");

  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const walletUsdtBalance = await mockUSDT.balanceOf(WALLET_ADDRESS);
  console.log("  Wallet USDT:", ethers.formatEther(walletUsdtBalance), "USDT\n");

  if (walletUsdtBalance < ethers.parseEther("1000")) {
    console.log("  ❌ Insufficient USDT for test (need at least 1000)\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ DEPLOYMENT COMPLETE!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("📝 Updated Addresses:");
    console.log("  New InvestmentEngine:", newIEAddress);
    console.log("  USDT:", USDT_ADDRESS);
    console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
    console.log("  OSLO Vault:", OSLO_VAULT_ADDRESS);
    console.log("  OSLODEX:", OSLODEX_ADDRESS);
    console.log("  Fee Router:", FEE_ROUTER_ADDRESS);
    console.log("  Referral:", REFERRAL_ADDRESS);
    console.log("  Timelock:", TIMELOCK_ADDRESS);
    console.log("");
    return;
  }

  // Approve USDT
  console.log("  Approving 1000 USDT for deposit...");
  const testAmount = ethers.parseEther("1000");
  const approveTx = await mockUSDT.approve(newIEAddress, testAmount);
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  // Test deposit
  console.log("  Attempting deposit of 1000 USDT...");
  try {
    const newIEWithSigner = await ethers.getContractAt("OSLOInvestmentEngine", newIEAddress, wallet);
    const depositTx = await newIEWithSigner.deposit(testAmount);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", depositTx.hash);
    
    const receipt = await depositTx.wait();
    console.log("  ✅ DEPOSIT SUCCESSFUL!");
    console.log("  Block:", receipt.blockNumber);
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("");

    // Verify deposit
    console.log("  📊 Verifying deposit...");
    const depositCount = await newIEWithSigner.getDepositCount(WALLET_ADDRESS);
    console.log("  Deposit count:", depositCount.toString());
    
    if (depositCount > 0n) {
      const deposit = await newIEWithSigner.getDeposit(WALLET_ADDRESS, 0);
      console.log("  Amount:", ethers.formatEther(deposit.amount), "USDT");
      console.log("  Tier:", deposit.tier);
      console.log("  Active:", deposit.active);
      console.log("");
    }
  } catch (error: any) {
    console.log("  ❌ Deposit failed!");
    console.log("  Error:", error.message);
    if (error.data) {
      console.log("  Raw data:", error.data);
    }
    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("📝 Updated Addresses:");
  console.log("  New InvestmentEngine:", newIEAddress);
  console.log("  USDT:", USDT_ADDRESS);
  console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
  console.log("  OSLO Vault:", OSLO_VAULT_ADDRESS);
  console.log("  OSLODEX:", OSLODEX_ADDRESS);
  console.log("  Fee Router:", FEE_ROUTER_ADDRESS);
  console.log("  Referral:", REFERRAL_ADDRESS);
  console.log("  Timelock:", TIMELOCK_ADDRESS);
  console.log("");
  console.log("⚠️  IMPORTANT: Update frontend/src/lib/contracts-testnet.ts with new IE address!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
