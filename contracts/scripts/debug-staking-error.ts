import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Staking Error Debug Script\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const walletAddress = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const privateKey = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  const wallet = new ethers.Wallet(privateKey).connect(ethers.provider);

  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Wallet:", walletAddress);
  console.log("💰 Wallet BNB:", ethers.formatEther(await ethers.provider.getBalance(walletAddress)), "BNB\n");

  // Contract addresses
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const INVESTMENT_ENGINE_ADDRESS = "0xcB406995e635C577d22b66F71fD84e748eC67488";
  const USDT_VAULT_ADDRESS = "0xe188afCb1Dacd30Ca8BbF5F69dBf64b08b0136B8"; // From error data
  const REFERRAL_ADDRESS = "0x0D584e91182a91e0500db20a603D0f732bE01B12"; // New fixed referral

  console.log("📋 Contract Addresses:");
  console.log("  USDT:", USDT_ADDRESS);
  console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
  console.log("  Investment Engine:", INVESTMENT_ENGINE_ADDRESS);
  console.log("  USDT Vault:", USDT_VAULT_ADDRESS);
  console.log("  Referral:", REFERRAL_ADDRESS);
  console.log("");

  // Get contract instances
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE_ADDRESS, wallet);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);

  // Step 1: Check registration status
  console.log("🔎 Step 1: Checking registration status...");
  const userInfo = await referral.userInfo(walletAddress);
  console.log("  Registered:", userInfo.registered);
  console.log("  Referrer:", userInfo.referrer);
  console.log("  Unlocked Levels:", userInfo.unlockedLevels);
  console.log("");

  if (!userInfo.registered) {
    console.log("❌ ERROR: Wallet is not registered!");
    console.log("💡 Must register before staking.\n");
    return;
  }

  // Step 2: Check USDT balance
  console.log("🔎 Step 2: Checking USDT balance...");
  const usdtBalance = await mockUSDT.balanceOf(walletAddress);
  console.log("  USDT Balance:", ethers.formatEther(usdtBalance));
  console.log("");

  // Step 3: Check current deposits
  console.log("🔎 Step 3: Checking existing deposits...");
  try {
    const depositCount = await investmentEngine.getDepositCount(walletAddress);
    console.log("  Number of deposits:", depositCount.toString());
    console.log("");

    if (depositCount > 0n) {
      console.log("  📊 Deposit Details:");
      for (let i = 0; i < depositCount; i++) {
        const deposit = await investmentEngine.getDeposit(walletAddress, i);
        console.log(`  Deposit #${i}:`);
        console.log(`    Amount: ${ethers.formatEther(deposit.amount)} USDT`);
        console.log(`    Package: ${deposit.packageId}`);
        console.log(`    Active: ${deposit.active}`);
        console.log(`    Start Time: ${new Date(Number(deposit.startTime) * 1000).toISOString()}`);
        console.log("");
      }
    }
  } catch (error) {
    console.log("  Cannot get deposit count:", error.message);
    console.log("");
  }

  // Step 4: Check allowance
  console.log("🔎 Step 4: Checking USDT allowance...");
  const allowance = await mockUSDT.allowance(walletAddress, INVESTMENT_ENGINE_ADDRESS);
  console.log("  Current Allowance:", ethers.formatEther(allowance), "USDT");
  console.log("");

  // Step 5: Decode the error
  console.log("🔎 Step 5: Analyzing error...");
  console.log("  Error selector: 0xfb8f41b2");
  console.log("  Address in error:", USDT_VAULT_ADDRESS);
  console.log("  Amount in error: 30,000 USDT (0x10f0cf064dd59200000)");
  console.log("");
  console.log("  💡 This error typically means:");
  console.log("     - Vault address is incorrect or not configured");
  console.log("     - USDT transfer to vault is failing");
  console.log("     - Vault contract doesn't have receive function");
  console.log("");

  // Step 6: Check vault contract
  console.log("🔎 Step 6: Checking USDT Vault...");
  try {
    const vaultBalance = await mockUSDT.balanceOf(USDT_VAULT_ADDRESS);
    console.log("  Vault USDT Balance:", ethers.formatEther(vaultBalance));
    
    // Try to check if vault has a deposit function
    const vaultContract = await ethers.getContractAt("OSLOVault", USDT_VAULT_ADDRESS);
    console.log("  ✅ Vault contract accessible");
    console.log("");
  } catch (error) {
    console.log("  ❌ Cannot access vault:", error.message);
    console.log("");
  }

  // Step 7: Check Investment Engine configuration
  console.log("🔎 Step 7: Checking Investment Engine configuration...");
  try {
    const ieWithoutSigner = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE_ADDRESS);
    
    // Check if engine is paused
    const paused = await ieWithoutSigner.paused();
    console.log("  Paused:", paused);
    
    // Check minimum deposit
    const minDeposit = await ieWithoutSigner.MIN_DEPOSIT();
    console.log("  Min Deposit:", ethers.formatEther(minDeposit), "USDT");
    
    // Check max deposit
    const maxDeposit = await ieWithoutSigner.MAX_DEPOSIT_PER_TX();
    console.log("  Max Deposit:", ethers.formatEther(maxDeposit), "USDT");
    console.log("");
  } catch (error) {
    console.log("  Cannot read Investment Engine config:", error.message);
    console.log("");
  }

  // Step 8: Attempt a small test deposit
  console.log("🔎 Step 8: Testing deposit with 100 USDT...");
  const testAmount = ethers.parseEther("100");
  
  if (usdtBalance < testAmount) {
    console.log("  ❌ Insufficient balance for test deposit");
    console.log("  Need:", ethers.formatEther(testAmount), "USDT");
    console.log("  Have:", ethers.formatEther(usdtBalance), "USDT\n");
    return;
  }

  console.log("  Approving", ethers.formatEther(testAmount), "USDT...");
  const approveTx = await mockUSDT.approve(INVESTMENT_ENGINE_ADDRESS, testAmount);
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  console.log("  Attempting deposit...");
  try {
    const depositTx = await investmentEngine.deposit(testAmount);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", depositTx.hash);
    
    const receipt = await depositTx.wait();
    console.log("  ✅ Deposit successful!");
    console.log("  Block:", receipt.blockNumber);
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("");
  } catch (error: any) {
    console.log("  ❌ Deposit failed!");
    console.log("  Error:", error.message);
    
    if (error.data) {
      console.log("  Raw data:", error.data);
    }
    
    if (error.reason) {
      console.log("  Reason:", error.reason);
    }
    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 RECOMMENDATIONS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("1. Check if Investment Engine has correct vault address");
  console.log("2. Verify USDT Vault contract is properly configured");
  console.log("3. Check if vault has receive/approve functions");
  console.log("4. Verify Investment Engine is not paused");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
