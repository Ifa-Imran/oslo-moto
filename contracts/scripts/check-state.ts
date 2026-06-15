import { ethers } from "hardhat";

async function main() {
  // V3 testnet addresses
  const referral = await ethers.getContractAt("OSLOReferral", "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274");
  const total = await referral.totalRegistered();
  console.log("📊 Total registered:", total.toString());
  
  // Check if first user is registered
  if (total > 0n) {
    console.log("\n⚠️  There are already registered users.");
    console.log("👉 You MUST provide a referrer address to register.");
    console.log("👉 Use a referral link or ask for a referrer address.");
  } else {
    console.log("\n✅ No users registered yet. You can register as root user.");
  }
}

main().catch(console.error);
