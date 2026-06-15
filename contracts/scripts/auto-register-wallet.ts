import { ethers } from "hardhat";

async function main() {
  console.log("📝 Auto-Register Wallet Script\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const targetWallet = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  
  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Target wallet:", targetWallet);
  console.log("💼 Deployer:", deployer.address);
  console.log("💰 Deployer BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Contract addresses
  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const MOCK_USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";

  // Get contract instances
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", MOCK_USDT_ADDRESS);

  // Step 1: Check if already registered
  console.log("🔎 Step 1: Checking registration status...");
  const userInfo = await referral.userInfo(targetWallet);
  
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
  const bnbBalance = await ethers.provider.getBalance(targetWallet);
  const usdtBalance = await mockUSDT.balanceOf(targetWallet);
  console.log("  BNB:", ethers.formatEther(bnbBalance));
  console.log("  USDT:", ethers.formatEther(usdtBalance));
  console.log("");

  // Step 3: Impersonate the target wallet
  console.log("🔎 Step 3: Impersonating target wallet...");
  console.log("  ⚠️  Note: This only works on testnet/forked networks");
  
  try {
    await ethers.provider.send("hardhat_impersonateAccount", [targetWallet]);
    console.log("  ✅ Successfully impersonating wallet\n");
  } catch (error) {
    console.log("  ❌ Cannot impersonate account (not a local network)");
    console.log("  💡 You must register manually via frontend\n");
    return;
  }

  const targetSigner = await ethers.getSigner(targetWallet);

  // Step 4: Approve USDT
  console.log("🔎 Step 4: Approving USDT for registration...");
  const REGISTRATION_FEE = ethers.parseEther("1");
  
  const approveTx = await mockUSDT.connect(targetSigner).approve(REFERRAL_ADDRESS, REGISTRATION_FEE);
  console.log("  Transaction hash:", approveTx.hash);
  console.log("  Waiting for confirmation...");
  await approveTx.wait();
  console.log("  ✅ Approval successful\n");

  // Verify allowance
  const allowance = await mockUSDT.allowance(targetWallet, REFERRAL_ADDRESS);
  console.log("  Allowance:", ethers.formatEther(allowance), "USDT\n");

  // Step 5: Register
  console.log("🔎 Step 5: Registering wallet...");
  const referrer = deployer.address; // Use deployer as referrer (already registered)
  console.log("  User:", targetWallet);
  console.log("  Referrer:", referrer);
  console.log("");

  try {
    const registerTx = await referral.connect(targetSigner).register(targetWallet, referrer);
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
    const updatedUserInfo = await referral.userInfo(targetWallet);
    console.log("📊 Updated User Info:");
    console.log("  Registered:", updatedUserInfo.registered);
    console.log("  Referrer:", updatedUserInfo.referrer);
    console.log("  Unlocked Levels:", updatedUserInfo.unlockedLevels);
    console.log("  Registration Number:", updatedUserInfo.registrationNumber);
    console.log("");

    // Check total registered
    const totalRegistered = await referral.totalRegistered();
    console.log("📈 Total Registered Users:", totalRegistered.toString());
    console.log("");

  } catch (error: any) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("❌ REGISTRATION FAILED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("Error:", error.message);
    
    if (error.data) {
      console.log("Raw data:", error.data);
    }
    console.log("");
  }

  // Stop impersonation
  try {
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [targetWallet]);
    console.log("🛑 Stopped impersonating wallet\n");
  } catch (error) {
    // Ignore
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
