import { ethers } from "hardhat";

const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";

async function main() {
  const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
  console.log("Referral contract:", REFERRAL);
  console.log("  usdt:", await ref.usdt());
  console.log("  osloToken:", await ref.osloToken());
  console.log("  investmentEngine:", await ref.investmentEngine());
  console.log("  osloDex:", await ref.osloDex());
  console.log("  admin:", await ref.admin());
  console.log("  timelock:", await ref.timelock());
  console.log("  setupComplete:", await ref.setupComplete());
  console.log("  totalRegistered:", (await ref.totalRegistered()).toString());
}

main().catch(console.error);