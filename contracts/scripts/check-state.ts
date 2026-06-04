import { ethers } from "hardhat";

async function main() {
  const referral = await ethers.getContractAt("OSLOReferral", "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e");
  const total = await referral.totalRegistered();
  console.log("Total registered:", total.toString());

  const vault = await ethers.getContractAt("OSLOVault", "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3");
  const totalDeposited = await vault.totalDeposited();
  console.log("Vault totalDeposited:", ethers.formatEther(totalDeposited));
}

main().catch(console.error);
