import { ethers } from "hardhat";

async function main() {
  console.log("📝 Register Wallet with Private Key\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const targetWalletAddress = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const privateKey = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);
  console.log("👤 Wallet address:", wallet.address);
  console.log("🔑 Address matches:", wallet.address === targetWalletAddress ? "✅ YES" : "❌ NO");
  
  if (wallet.address !== targetWalletAddress) {
    console.log("❌ Private key does not match the target wallet!");
    return;
  }
  console.log("");

  // Connect wallet to provider
  const targetSigner = wallet.connect(ethers.provider);
  console.log("💰 Wallet BNB balance:", ethers.formatEther(await ethers.provider.getBalance(wallet.address)), "BNB\n");

  // Contract addresses
  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const MOCK_USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const referrerAddress = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

  // Get contract instances with signer
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", MOCK_USDT_ADDRESS, targetSigner);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS, targetSigner);

  // Step 1: Check if already registered
  console.log("🔎 Step 1: Checking registration status...");
  const userInfo = await referral.userInfo(wallet.address);
  
  if (userInfo.registered) {
    console.log("⚠️  Wallet is ALREADY REGISTERED!");
    console.log("  Referrer:", userInfo.referrer);
    console.log("  Unlocked Levels:", userInfo.unlockedLevels);
    console.log("\nNo action needed.\n");
    return;
  }
  console.log("  ✅ Not registered yet\n");

  // Step 2: Check balances
  console.log("🔎 Step 2: Checking balances...");
  const usdtBalance = await mockUSDT.balanceOf(wallet.address);
  console.log("  USDT:", ethers.formatEther(usdtBalance));
  
  const REGISTRATION_FEE = ethers.parseEther("1");
  if (usdtBalance < REGISTRATION_FEE) {
    console.log("  ❌ Insufficient USDT balance!");
    return;
  }
  console.log("  ✅ Sufficient USDT\n");

  // Step 3: Check referrer
  console.log("🔎 Step 3: Verifying referrer...");
  const referralWithoutSigner = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);
  const referrerInfo = await referralWithoutSigner.userInfo(referrerAddress);
  console.log("  Referrer:", referrerAddress);
  console.log("  Registered:", referrerInfo.registered);
  
  if (!referrerInfo.registered) {
    console.log("  ❌ Referrer is not registered!");
    return;
  }
  console.log("  ✅ Valid referrer\n");

  // Step 4: Approve USDT
  console.log("🔎 Step 4: Approving USDT for registration...");
  console.log("  Approving:", ethers.formatEther(REGISTRATION_FEE), "USDT");
  
  const approveTx = await mockUSDT.approve(REFERRAL_ADDRESS, REGISTRATION_FEE);
  console.log("  ⏳ Transaction sent!");
  console.log("  Hash:", approveTx.hash);
  console.log("  Waiting for confirmation...");
  
  const approveReceipt = await approveTx.wait();
  console.log("  ✅ Approval successful!");
  console.log("  Block:", approveReceipt.blockNumber);
  console.log("  Gas used:", approveReceipt.gasUsed.toString());
  console.log("");

  // Verify allowance
  const allowance = await mockUSDT.allowance(wallet.address, REFERRAL_ADDRESS);
  console.log("  ✅ Allowance:", ethers.formatEther(allowance), "USDT\n");

  // Step 5: Register
  console.log("🔎 Step 5: Registering wallet...");
  console.log("  User:", wallet.address);
  console.log("  Referrer:", referrerAddress);
  console.log("");

  try {
    const registerTx = await referral.register(wallet.address, referrerAddress);
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", registerTx.hash);
    console.log("  Waiting for confirmation...\n");
    
    const receipt = await registerTx.wait();
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ REGISTRATION SUCCESSFUL!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Block Number:", receipt.blockNumber);
    console.log("  Gas Used:", receipt.gasUsed.toString());
    console.log("  Transaction Hash:", receipt.hash);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Verify registration
    const updatedUserInfo = await referralWithoutSigner.userInfo(wallet.address);
    console.log("📊 Updated User Info:");
    console.log("  Registered:", updatedUserInfo.registered);
    console.log("  Referrer:", updatedUserInfo.referrer);
    console.log("  Unlocked Levels:", updatedUserInfo.unlockedLevels);
    console.log("  Registration Number:", updatedUserInfo.registrationNumber);
    console.log("");

    // Check total registered
    const totalRegistered = await referralWithoutSigner.totalRegistered();
    console.log("📈 Total Registered Users:", totalRegistered.toString());
    console.log("");

    console.log("🎉 Wallet successfully registered!");
    console.log("💡 You can now use the frontend with this wallet.\n");

  } catch (error: any) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("❌ REGISTRATION FAILED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("Error:", error.message);
    
    if (error.data) {
      console.log("Raw data:", error.data);
    }
    
    if (error.reason) {
      console.log("Reason:", error.reason);
    }
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
