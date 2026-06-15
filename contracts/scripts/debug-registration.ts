import { ethers } from "hardhat";

async function main() {
  console.log("🔍 OSLO Registration Debug Script\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Deployer address:", deployer.address);
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

  // Step 1: Check if deployer is already registered
  console.log("🔎 Step 1: Checking registration status...");
  const userInfo = await referral.userInfo(deployer.address);
  console.log("  Registered:", userInfo.registered);
  console.log("  Referrer:", userInfo.referrer);
  console.log("  Unlocked Levels:", userInfo.unlockedLevels);
  console.log("");

  if (userInfo.registered) {
    console.log("❌ ERROR: Deployer is ALREADY REGISTERED!");
    console.log("💡 You cannot register the same wallet twice.");
    console.log("💡 Use a DIFFERENT wallet address to test registration.\n");
    return;
  }

  // Step 2: Check USDT balance
  console.log("🔎 Step 2: Checking USDT balance...");
  const usdtBalance = await mockUSDT.balanceOf(deployer.address);
  console.log("  USDT Balance:", ethers.formatEther(usdtBalance));
  
  const REGISTRATION_FEE = ethers.parseEther("1");
  if (usdtBalance < REGISTRATION_FEE) {
    console.log("❌ ERROR: Insufficient USDT balance!");
    console.log("  Required:", ethers.formatEther(REGISTRATION_FEE), "USDT");
    console.log("  Available:", ethers.formatEther(usdtBalance), "USDT");
    console.log("💡 Use the faucet to get USDT: Click 'Claim 10,000 USDT' button\n");
    return;
  }
  console.log("  ✅ Sufficient balance\n");

  // Step 3: Check current allowance
  console.log("🔎 Step 3: Checking USDT allowance for referral contract...");
  const currentAllowance = await mockUSDT.allowance(deployer.address, REFERRAL_ADDRESS);
  console.log("  Current Allowance:", ethers.formatEther(currentAllowance), "USDT");
  
  if (currentAllowance < REGISTRATION_FEE) {
    console.log("  ⚠️  Allowance insufficient, will approve...\n");
  } else {
    console.log("  ✅ Sufficient allowance\n");
  }

  // Step 4: Check referrer status
  console.log("🔎 Step 4: Checking referrer address...");
  const referrerAddress = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";
  console.log("  Referrer:", referrerAddress);
  
  const referrerInfo = await referral.userInfo(referrerAddress);
  console.log("  Referrer Registered:", referrerInfo.registered);
  
  if (!referrerInfo.registered) {
    console.log("❌ ERROR: Referrer is NOT registered!");
    console.log("💡 The referrer address must be registered first.\n");
    return;
  }
  console.log("  ✅ Referrer is valid\n");

  // Step 5: Approve USDT
  console.log("🔎 Step 5: Approving USDT for registration...");
  if (currentAllowance < REGISTRATION_FEE) {
    console.log("  Sending approve transaction...");
    const approveTx = await mockUSDT.approve(REFERRAL_ADDRESS, REGISTRATION_FEE);
    console.log("  Transaction hash:", approveTx.hash);
    console.log("  Waiting for confirmation...");
    await approveTx.wait();
    console.log("  ✅ Approval successful\n");
    
    // Verify new allowance
    const newAllowance = await mockUSDT.allowance(deployer.address, REFERRAL_ADDRESS);
    console.log("  New Allowance:", ethers.formatEther(newAllowance), "USDT\n");
  } else {
    console.log("  ⏭️  Skipping approval (already approved)\n");
  }

  // Step 6: Attempt registration
  console.log("🔎 Step 6: Attempting registration...");
  console.log("  User:", deployer.address);
  console.log("  Referrer:", referrerAddress);
  console.log("");

  try {
    // Get gas estimate first
    console.log("  Estimating gas...");
    const gasEstimate = await referral.register.estimateGas(deployer.address, referrerAddress);
    console.log("  ✅ Gas estimate:", gasEstimate.toString(), "gas units\n");

    // Send transaction
    console.log("  Sending registration transaction...");
    const tx = await referral.register(deployer.address, referrerAddress, {
      gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
    });
    
    console.log("  ⏳ Transaction sent!");
    console.log("  Hash:", tx.hash);
    console.log("  Waiting for confirmation...\n");
    
    const receipt = await tx.wait();
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ REGISTRATION SUCCESSFUL!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Block Number:", receipt.blockNumber);
    console.log("  Gas Used:", receipt.gasUsed.toString());
    console.log("  Transaction Hash:", receipt.hash);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Verify registration
    const updatedUserInfo = await referral.userInfo(deployer.address);
    console.log("📊 Updated User Info:");
    console.log("  Registered:", updatedUserInfo.registered);
    console.log("  Referrer:", updatedUserInfo.referrer);
    console.log("  Unlocked Levels:", updatedUserInfo.unlockedLevels);
    console.log("");

  } catch (error: any) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("❌ REGISTRATION FAILED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("Error Details:");
    console.log("  Message:", error.message);
    console.log("");
    
    if (error.data) {
      console.log("  Raw Error Data:", error.data);
      console.log("");
    }
    
    if (error.reason) {
      console.log("  Reason:", error.reason);
      console.log("");
    }
    
    // Decode common error selectors
    const errorData = error.data || error.message;
    
    if (errorData.includes("0xe450d38c")) {
      console.log("🔍 Decoded Error: InvalidReferrer()");
      console.log("   The referrer address has not registered yet.");
      console.log("   Solution: Use a different referrer that is already registered.\n");
    } else if (errorData.includes("AlreadyRegistered")) {
      console.log("🔍 Decoded Error: AlreadyRegistered()");
      console.log("   This wallet is already registered.");
      console.log("   Solution: Use a different wallet address.\n");
    } else if (errorData.includes("SelfReferral")) {
      console.log("🔍 Decoded Error: SelfReferral()");
      console.log("   You cannot use your own address as referrer.");
      console.log("   Solution: Use a different referrer address.\n");
    } else if (errorData.includes("ZeroAddress")) {
      console.log("🔍 Decoded Error: ZeroAddress()");
      console.log("   User address cannot be zero address.\n");
    } else {
      console.log("🔍 Unknown error. Check the raw error data above.\n");
    }
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
