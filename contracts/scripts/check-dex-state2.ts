import { ethers } from "hardhat";
async function main() {
  const dex = await ethers.getContractAt("OSLODEX", "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F");
  console.log("DEX admin:", await dex.admin());
  console.log("DEX timelock:", await dex.timelock());
  console.log("DEX investmentEngine:", await dex.investmentEngine());
  console.log("DEX setupComplete:", await dex.setupComplete());
  console.log("DEX usdt:", await dex.usdt());
}
main().catch(console.error);