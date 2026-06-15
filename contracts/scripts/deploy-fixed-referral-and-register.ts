import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploy Fixed OSLOReferral & Register Wallet\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 BNB Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Contract addresses from testnet-addresses.json
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C"; // MockUSDT with faucet
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const DEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const INVESTMENT_ENGINE = "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC";
  const TIMELOCK = deployer.address; // Use deployer as timelock for testnet
  
  const WALLET_TO_REGISTER = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const REFERRER_ADDRESS = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

  console.log("📋 Contract Configuration:");
  console.log("  USDT:", USDT_ADDRESS);
  console.log("  OSLO Token:", OSLO_TOKEN_ADDRESS);
  console.log("  DEX:", DEX_ADDRESS);
  console.log("  Investment Engine:", INVESTMENT_ENGINE);
  console.log("");

  // Step 1: Deploy fixed OSLOReferral
  console.log("🔎 Step 1: Deploying fixed OSLOReferral...");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const newReferral = await OSLOReferral.deploy(USDT_ADDRESS, OSLO_TOKEN_ADDRESS);
  await newReferral.waitForDeployment();
  const newReferralAddress = await newReferral.getAddress();
  
  console.log("  ✅ New OSLOReferral deployed!");
  console.log("  Address:", newReferralAddress);
  console.log("");

  // Step 2: Configure the new referral contract
  console.log("🔎 Step 2: Configuring new referral contract...");
  console.log("  Calling configure()...");
  const configureTx = await newReferral.configure(INVESTMENT_ENGINE, DEX_ADDRESS, TIMELOCK);
  await configureTx.wait();
  console.log("  ✅ Configured (DEX, Investment Engine, Timelock)\n");

  // Complete setup
  console.log("  Completing setup...");
  const completeSetupTx = await newReferral.completeSetup();
  await completeSetupTx.wait();
  console.log("  ✅ Setup complete!\n");

  // Step 3: Fund wallet with USDT (if needed)
  console.log("🔎 Step 3: Checking wallet USDT balance...");
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS);
  const walletBalance = await mockUSDT.balanceOf(WALLET_TO_REGISTER);
  console.log("  Current balance:", ethers.formatEther(walletBalance));
  
  if (walletBalance < ethers.parseEther("1")) {
    console.log("  Transferring 10 USDT to wallet...");
    const transferTx = await mockUSDT.transfer(WALLET_TO_REGISTER, ethers.parseEther("10"));
    await transferTx.wait();
    console.log("  ✅ Transferred 10 USDT\n");
  } else {
    console.log("  ✅ Sufficient balance\n");
  }

  // Step 4: Register the wallet using private key
  console.log("🔎 Step 4: Registering wallet with private key...");
  const privateKey = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
  const wallet = new ethers.Wallet(privateKey).connect(ethers.provider);
  console.log("  Wallet:", wallet.address);
  
  const referralWithSigner = await ethers.getContractAt("OSLOReferral", newReferralAddress, wallet);
  const mockUSDTWithSigner = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS, wallet);

  // Approve USDT
  console.log("  Approving 1 USDT...");
  const approveTx = await mockUSDTWithSigner.approve(newReferralAddress, ethers.parseEther("1"));
  await approveTx.wait();
  console.log("  ✅ Approved\n");

  // Register
  console.log("  Registering...");
  console.log("  Note: Using zero address as referrer (first user on new contract)");
  const registerTx = await referralWithSigner.register(WALLET_TO_REGISTER, ethers.ZeroAddress);
  console.log("  Transaction hash:", registerTx.hash);
  await registerTx.wait();
  console.log("  ✅ Registered!\n");

  // Verify
  const userInfo = await newReferral.userInfo(WALLET_TO_REGISTER);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ REGISTRATION SUCCESSFUL!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Registered:", userInfo.registered);
  console.log("  Referrer:", userInfo.referrer);
  console.log("  Unlocked Levels:", userInfo.unlockedLevels);
  console.log("  New Referral Contract:", newReferralAddress);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("💡 IMPORTANT: Update the frontend to use the new referral contract!");
  console.log("   File: frontend/src/lib/contracts-testnet.ts");
  console.log("   Change referral to:", newReferralAddress);
  console.log("");
  
  // Save addresses to file
  const fs = await import("fs");
  const path = await import("path");
  const addressesFile = path.join(__dirname, "../data/testnet-v4-addresses.json");
  
  const addresses = {
    network: "bsc-testnet",
    chainId: 97,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockUSDT: USDT_ADDRESS,
      OSLOToken: OSLO_TOKEN_ADDRESS,
      OSLODEX: DEX_ADDRESS,
      OSLOInvestmentEngine: INVESTMENT_ENGINE,
      OSLOReferralV2: newReferralAddress,
      OSLOReferralOld: "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274"
    },
    testWallet: WALLET_TO_REGISTER,
    status: "deployed"
  };
  
  fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
  console.log("📄 Addresses saved to:", addressesFile);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
