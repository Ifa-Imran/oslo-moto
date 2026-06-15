import { ethers } from "hardhat";

async function main() {
  const [deployer, testUser] = await ethers.getSigners();
  console.log("🔑 Deployer address:", deployer.address);
  console.log("🔑 Test user address:", testUser.address);
  
  const referral = await ethers.getContractAt("OSLOReferral", "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274");
  const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C");
  
  // Check if test user is already registered
  const userInfo = await referral.userInfo(testUser.address);
  console.log("📊 Test user already registered:", userInfo.registered);
  
  if (userInfo.registered) {
    console.log("❌ Test user is already registered!");
    return;
  }
  
  // Send some USDT to test user
  console.log("\n💸 Sending 100 USDT to test user...");
  const sendTx = await mockUSDT.transfer(testUser.address, ethers.parseEther("100"));
  await sendTx.wait();
  console.log("✅ Sent 100 USDT");
  
  // Check USDT balance
  const balance = await mockUSDT.balanceOf(testUser.address);
  console.log("💰 Test user USDT balance:", ethers.formatEther(balance));
  
  if (balance < ethers.parseEther("1")) {
    console.log("❌ Insufficient USDT balance. Need at least 1 USDT");
    return;
  }
  
  // Check allowance
  const allowance = await mockUSDT.allowance(testUser.address, referral.target);
  console.log("💵 Current allowance:", ethers.formatEther(allowance));
    
  // Approve if needed (using deployer to approve on behalf of test user won't work, need to connect)
  const testUserUSDT = mockUSDT.connect(testUser);
  const testUserReferral = referral.connect(testUser);
    
  if (allowance < ethers.parseEther("1")) {
    console.log("\n📝 Test user approving 1 USDT...");
    const approveTx = await testUserUSDT.approve(referral.target, ethers.parseEther("1"));
    await approveTx.wait();
    console.log("✅ Approved!");
  }
    
  // Try to register with the referrer
  const referrer = deployer.address; // Use deployer as referrer (already registered)
    
  console.log("\n🎯 Test user registering with referrer:", referrer);
    
  try {
    const tx = await testUserReferral.register(testUser.address, referrer);
    console.log("⌛ Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Registration successful!");
    console.log("📝 Transaction receipt:", receipt);
  } catch (error: any) {
    console.error("\n❌ Registration failed!");
    console.error("Error message:", error.message);
    console.error("Error data:", error.data);
    console.error("Error reason:", error.reason);
      
    // Try to decode the error
    if (error.data) {
      console.error("\n🔍 Raw error data:", error.data);
    }
  }
}

main().catch(console.error);
