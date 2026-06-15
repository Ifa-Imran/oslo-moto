import { ethers } from "hardhat";

async function main() {
  console.log("📝 Registering Wallet Script\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const targetWallet = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  
  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Target wallet:", targetWallet);
  console.log("💼 Deployer (payer):", deployer.address);
  console.log("💰 Deployer BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Contract addresses
  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const MOCK_USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";

  // Get contract instances
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", MOCK_USDT_ADDRESS);

  console.log("📋 Contract Addresses:");
  console.log("  Referral:", REFERRAL_ADDRESS);
  console.log("  Mock USDT:", MOCK_USDT_ADDRESS);
  console.log("");

  // Step 1: Check if wallet is already registered
  console.log("🔎 Step 1: Checking if wallet is already registered...");
  const userInfo = await referral.userInfo(targetWallet);
  console.log("  Registered:", userInfo.registered);
  
  if (userInfo.registered) {
    console.log("\n⚠️  Wallet is ALREADY REGISTERED!");
    console.log("  Referrer:", userInfo.referrer);
    console.log("  Unlocked Levels:", userInfo.unlockedLevels);
    console.log("\nNo need to register again.\n");
    return;
  }
  console.log("  ✅ Wallet is not registered yet\n");

  // Step 2: Fund wallet with BNB for gas
  console.log("🔎 Step 2: Checking target wallet BNB balance...");
  const walletBalance = await ethers.provider.getBalance(targetWallet);
  console.log("  Current BNB balance:", ethers.formatEther(walletBalance), "BNB");
  
  if (walletBalance < ethers.parseEther("0.01")) {
    console.log("  ⚠️  Insufficient BNB for gas, sending 0.01 BNB...");
    const tx = await deployer.sendTransaction({
      to: targetWallet,
      value: ethers.parseEther("0.01")
    });
    await tx.wait();
    console.log("  ✅ Sent 0.01 BNB to target wallet\n");
  } else {
    console.log("  ✅ Sufficient BNB balance\n");
  }

  // Step 3: Fund wallet with USDT for registration fee
  console.log("🔎 Step 3: Checking target wallet USDT balance...");
  const usdtBalance = await mockUSDT.balanceOf(targetWallet);
  console.log("  Current USDT balance:", ethers.formatEther(usdtBalance));
  
  const REGISTRATION_FEE = ethers.parseEther("1");
  if (usdtBalance < REGISTRATION_FEE) {
    console.log("  ⚠️  Insufficient USDT, sending 10 USDT from faucet...");
    
    // Call faucet to get USDT for deployer first
    const deployerUSDT = await mockUSDT.balanceOf(deployer.address);
    console.log("  Deployer USDT balance:", ethers.formatEther(deployerUSDT));
    
    if (deployerUSDT < REGISTRATION_FEE) {
      console.log("  🚰 Calling faucet for deployer...");
      const faucetTx = await mockUSDT.faucet();
      await faucetTx.wait();
      console.log("  ✅ Faucet successful\n");
    }
    
    // Transfer USDT to target wallet
    console.log("  Transferring 10 USDT to target wallet...");
    const transferTx = await mockUSDT.transfer(targetWallet, ethers.parseEther("10"));
    await transferTx.wait();
    console.log("  ✅ Transferred 10 USDT\n");
  } else {
    console.log("  ✅ Sufficient USDT balance\n");
  }

  // Step 4: Check referrer (use deployer who is already registered)
  console.log("🔎 Step 4: Setting up referrer...");
  const referrer = deployer.address; // Deployer is the root user
  console.log("  Referrer:", referrer);
  
  const referrerInfo = await referral.userInfo(referrer);
  console.log("  Referrer registered:", referrerInfo.registered);
  
  if (!referrerInfo.registered) {
    console.log("❌ ERROR: Referrer is not registered!");
    return;
  }
  console.log("  ✅ Referrer is valid\n");

  // Step 5: Approve USDT from target wallet
  console.log("🔎 Step 5: Approving USDT for registration...");
  console.log("  Note: This requires the target wallet to sign the transaction");
  console.log("  ⚠️  Cannot approve without target wallet's private key");
  console.log("  💡 You need to approve from the target wallet directly via frontend\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 MANUAL STEPS REQUIRED:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("1. Import wallet", targetWallet, "into MetaMask");
  console.log("2. Switch to BSC Testnet network");
  console.log("3. Go to http://localhost:3000");
  console.log("4. Connect the wallet");
  console.log("5. You already have:");
  console.log("   ✅ 0.01 BNB for gas");
  console.log("   ✅ 10 USDT for registration fee");
  console.log("6. Enter referrer address:", referrer);
  console.log("7. Click Register");
  console.log("\nThe registration should succeed!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
