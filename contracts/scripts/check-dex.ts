import { ethers } from "hardhat";

async function main() {
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

  const dex = await ethers.getContractAt("OSLODexV2", DEX_ADDR);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);

  const [usdtRes, osloRes] = await dex.getReserves();
  const price = await dex.getPrice();
  const admin = await dex.admin();
  const dexSetupComplete = await dex.setupComplete();

  console.log("═══ DEX V2 Status ═══");
  console.log("  Address:", DEX_ADDR);
  console.log("  USDT Reserve:", ethers.formatEther(usdtRes));
  console.log("  OSLO Reserve:", ethers.formatEther(osloRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("  Admin:", admin);
  console.log("  setupComplete:", dexSetupComplete);

  // Check referral's osloDex pointer
  const refOsloDex = await referral.osloDex();
  const refAdmin = await referral.admin();
  const refSetupComplete = await referral.setupComplete();
  console.log("\n═══ Referral Contract ═══");
  console.log("  Address:", REFERRAL_ADDR);
  console.log("  osloDex pointer:", refOsloDex);
  console.log("  Points to current DEX?", refOsloDex.toLowerCase() === DEX_ADDR.toLowerCase());
  console.log("  Admin:", refAdmin);
  console.log("  setupComplete:", refSetupComplete);
}

main().catch(console.error);
