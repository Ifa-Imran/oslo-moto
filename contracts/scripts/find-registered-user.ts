import { ethers } from "hardhat";

async function main() {
  const referral = await ethers.getContractAt("OSLOReferral", "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274");
  
  const [deployer] = await ethers.getSigners();
  console.log("🔍 Checking deployer address:", deployer.address);
  
  // Check if deployer is registered
  const deployerInfo = await referral.userInfo(deployer.address);
  console.log("📊 Deployer registered:", deployerInfo.registered);
  
  if (deployerInfo.registered) {
    console.log("\n✅ USE THIS ADDRESS AS REFERRER:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(deployer.address);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n👉 Copy this address and paste it in the referrer field!");
  } else {
    console.log("\n❌ Deployer not registered. Trying to find registered user from events...");
    
    // Get recent registration events
    const events = await referral.queryFilter(referral.filters.UserRegistered(), 0, -1);
    console.log(`\n📊 Found ${events.length} registration events`);
    
    if (events.length > 0) {
      const firstEvent = events[0] as any;
      console.log("\n✅ FIRST REGISTERED USER (use this as referrer):");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(firstEvent.args?.user || firstEvent.topics?.[1]);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
  }
}

main().catch(console.error);
