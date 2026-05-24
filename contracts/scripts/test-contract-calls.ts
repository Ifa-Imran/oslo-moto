import { ethers } from "hardhat";

const REFERRAL = "0x0e2b26C5206FADDFcCB55E8Ae640d809954193b0";
const TEST_WALLET = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  console.log("=== Direct Contract Call Test ===\n");

  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);

  try {
    // Test direct function calls
    console.log("1. Testing isRegistered...");
    const isReg = await referral.isRegistered(TEST_WALLET);
    console.log(`   Result: ${isReg}`);

    console.log("\n2. Testing registrationNumber (mapping)...");
    const regNum = await referral.registrationNumber(TEST_WALLET);
    console.log(`   Result: ${regNum}`);

    console.log("\n3. Testing getAirdropBalance...");
    const airdrop = await referral.getAirdropBalance(TEST_WALLET);
    console.log(`   Result: ${ethers.formatEther(airdrop)} OSLO`);

    console.log("\n4. Testing totalClaimed (mapping)...");
    const claimed = await referral.totalClaimed(TEST_WALLET);
    console.log(`   Result: ${ethers.formatEther(claimed)} OSLO`);

    console.log("\n5. Testing vestingStartTime (mapping)...");
    const vestStart = await referral.vestingStartTime(TEST_WALLET);
    console.log(`   Result: ${vestStart}`);

    console.log("\n✅ All calls successful!");
  } catch (error: any) {
    console.log("\n❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
