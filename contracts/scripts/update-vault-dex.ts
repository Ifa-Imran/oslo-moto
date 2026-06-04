import { ethers } from "hardhat";

async function main() {
  const [d] = await ethers.getSigners();

  const NEW_DEX = "0x1a881a4bFD2E72c70667b8bD7bF77227a9f6Cf03";
  const VAULT_ADDR = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";

  const vault = await ethers.getContractAt("OSLOVault", VAULT_ADDR);

  console.log("Current osloDex:", await vault.osloDex());

  const tx = await vault.configure(
    NEW_DEX,
    await vault.referral(),
    await vault.rankSystem(),
    await vault.timelock()
  );
  await tx.wait();

  console.log("New osloDex:", await vault.osloDex());
  console.log("✓ Vault updated to new DEX");
}

main().catch(console.error);
