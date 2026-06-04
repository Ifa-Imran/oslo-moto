import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const NEW_DEX = "0x5A7C5046FbB6aDdF7Ae36D08Ab0A603be694798C";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const RANK_SYSTEM = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const TREASURY = "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF";

  // ─── 1. Vault.configure(_osloDex, _referral, _rankSystem, _timelock) ───
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  console.log("\n── Vault ──");
  const vRef = await vault.referral();
  const vRank = await vault.rankSystem();
  const vTL = await vault.timelock();
  console.log("  Current referral:", vRef);
  console.log("  Current rankSystem:", vRank);
  console.log("  Current timelock:", vTL);
  
  const tx1 = await vault.configure(NEW_DEX, vRef, vRank, vTL);
  await tx1.wait();
  console.log("  ✓ Vault.osloDex →", NEW_DEX);

  // ─── 2. Referral.configure(_investmentEngine, _osloDex, _timelock) ───
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const rIE = await referral.investmentEngine();
  const rTL = await referral.timelock();
  console.log("\n── Referral ──");
  console.log("  Current investmentEngine:", rIE);
  
  const tx2 = await referral.configure(rIE, NEW_DEX, rTL);
  await tx2.wait();
  console.log("  ✓ Referral.osloDex →", NEW_DEX);

  // ─── 3. IE.configure(_treasury, _referral, _rankSystem, _osloDex, _timelock) ───
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  const ieTreasury = await ie.treasury();
  const ieRef = await ie.referral();
  const ieRank = await ie.rankSystem();
  const ieTL = await ie.timelock();
  console.log("\n── InvestmentEngine ──");
  
  const tx3 = await ie.configure(ieTreasury, ieRef, ieRank, NEW_DEX, ieTL);
  await tx3.wait();
  console.log("  ✓ IE.osloDex →", NEW_DEX);

  // ─── Verify ───
  console.log("\n═══ Verification ═══");
  const vAfter = await vault.osloDex();
  const rAfter = await referral.osloDex();
  const ieAfter = await ie.osloDex();
  console.log("  Vault.osloDex:", vAfter, vAfter === NEW_DEX ? "✓" : "✗");
  console.log("  Referral.osloDex:", rAfter, rAfter === NEW_DEX ? "✓" : "✗");
  console.log("  IE.osloDex:", ieAfter, ieAfter === NEW_DEX ? "✓" : "✗");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
