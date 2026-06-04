import { ethers } from "hardhat";

async function main() {
  const v = await ethers.getContractAt("OSLOVault", "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3");
  console.log("osloDex:", await v.osloDex());
  console.log("referral:", await v.referral());
  console.log("rankSystem:", await v.rankSystem());
  console.log("timelock:", await v.timelock());
  console.log("setupComplete:", await v.setupComplete());
}

main().catch(console.error);
