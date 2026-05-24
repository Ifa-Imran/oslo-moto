import { ethers } from "hardhat";

const REFERRAL = "0x0e2b26C5206FADDFcCB55E8Ae640d809954193b0";
const TEST_WALLET = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  console.log("=== Checking Airdrop Status ===\n");

  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);

  // Check if user is registered
  const isRegistered = await referral.isRegistered(TEST_WALLET);
  console.log(`User registered: ${isRegistered}`);

  if (isRegistered) {
    // Get registration number
    const regNum = await referral.registrationNumber(TEST_WALLET);
    console.log(`Registration number: ${regNum}`);

    // Get airdrop balance
    const airdropBal = await referral.getAirdropBalance(TEST_WALLET);
    console.log(`Airdrop balance (escrow): ${ethers.formatEther(airdropBal)} OSLO`);

    // Get claimable airdrop
    const claimableBal = await referral.getClaimableAirdrop(TEST_WALLET);
    console.log(`Claimable airdrop: ${ethers.formatEther(claimableBal)} OSLO`);

    // Get total registered
    const totalReg = await referral.totalRegistered();
    console.log(`Total registered: ${totalReg}`);

    // Check userInfo
    const userInfo = await referral.userInfo(TEST_WALLET);
    console.log(`\nUser Info:`);
    console.log(`  Referrer: ${userInfo.referrer}`);
    console.log(`  Unlocked levels: ${userInfo.unlockedLevels}`);
    console.log(`  Total earned: ${ethers.formatEther(userInfo.totalEarned)} USDT`);
    console.log(`  Registered: ${userInfo.registered}`);
  } else {
    console.log("\n❌ User is NOT registered on this contract!");
    console.log("You need to register again on the new v8.0 contract to receive airdrop.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
