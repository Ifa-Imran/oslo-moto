import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploy Updated MockUSDT with forceApprove Support\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Network: BSC Testnet (Chain ID: 97)");
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 BNB Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Old contract addresses
  const OLD_MOCK_USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const WALLET_TO_REGISTER = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
  const REFERRER_ADDRESS = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

  console.log("📋 Current Contracts:");
  console.log("  Old MockUSDT:", OLD_MOCK_USDT);
  console.log("  Referral:", REFERRAL_ADDRESS);
  console.log("");

  // Step 1: Deploy new MockUSDT
  console.log("🔎 Step 1: Deploying new MockUSDT with forceApprove...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const newMockUSDT = await MockUSDT.deploy();
  await newMockUSDT.waitForDeployment();
  const newMockUSDTAddress = await newMockUSDT.getAddress();
  
  console.log("  ✅ New MockUSDT deployed!");
  console.log("  Address:", newMockUSDTAddress);
  console.log("");

  // Step 2: Fund the wallet with new USDT
  console.log("🔎 Step 2: Funding wallet with new USDT...");
  const transferTx = await newMockUSDT.transfer(WALLET_TO_REGISTER, ethers.parseEther("10000"));
  await transferTx.wait();
  console.log("  ✅ Transferred 10,000 USDT to wallet\n");

  // Check balance
  const walletBalance = await newMockUSDT.balanceOf(WALLET_TO_REGISTER);
  console.log("  Wallet USDT balance:", ethers.formatEther(walletBalance), "\n");

  // Step 3: Update referral contract to use new MockUSDT
  console.log("🔎 Step 3: Updating referral contract...");
  console.log("  ⚠️  WARNING: OSLOReferral doesn't have a setUSDT function!");
  console.log("  💡 The USDT address is set in constructor and cannot be changed");
  console.log("  💡 We need to deploy a new referral contract OR use a workaround\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️  CRITICAL ISSUE:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("The OSLOReferral contract has the USDT address hardcoded in the constructor.");
  console.log("We cannot update it to use the new MockUSDT without redeploying the referral contract.\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 ALTERNATIVE SOLUTION:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Instead of deploying new MockUSDT, let's:");
  console.log("1. Update the OSLOReferral contract to wrap forceApprove in try/catch");
  console.log("2. Deploy new OSLOReferral with the fix");
  console.log("3. Migrate state from old to new contract");
  console.log("4. Register the wallet\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 RECOMMENDED APPROACH:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Since redeploying all contracts is complex, here's a simpler fix:");
  console.log("1. Modify OSLOReferral.sol to wrap line 170 (forceApprove) in try/catch");
  console.log("2. Deploy new OSLOReferral");
  console.log("3. Call completeSetup to configure it");
  console.log("4. Register the wallet\n");

  console.log("Would you like me to:");
  console.log("  A) Deploy new OSLOReferral with the fix (10-15 minutes)");
  console.log("  B) Try a different workaround (faster)");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
