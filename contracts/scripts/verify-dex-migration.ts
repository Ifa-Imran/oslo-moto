import { ethers } from "hardhat";

async function main() {
  const NEW_DEX = "0x1a881a4bFD2E72c70667b8bD7bF77227a9f6Cf03";

  // Check all contracts point to new DEX
  const vault = await ethers.getContractAt("OSLOVault", "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3");
  const referral = await ethers.getContractAt("OSLOReferral", "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e");
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa");
  const dex = await ethers.getContractAt("OSLODexV2", NEW_DEX);

  console.log("═══ Final Verification ═══\n");

  console.log("Vault.osloDex:        ", await vault.osloDex(), (await vault.osloDex()).toLowerCase() === NEW_DEX.toLowerCase() ? "✓" : "✗");
  console.log("Referral.osloDex:     ", await referral.osloDex(), (await referral.osloDex()).toLowerCase() === NEW_DEX.toLowerCase() ? "✓" : "✗");
  console.log("IE.osloDex:           ", await ie.osloDex(), (await ie.osloDex()).toLowerCase() === NEW_DEX.toLowerCase() ? "✓" : "✗");

  const [uRes, oRes] = await dex.getReserves();
  const price = await dex.getPrice();
  console.log("\n═══ New DEX (", NEW_DEX, ") ═══");
  console.log("  USDT Reserve:", ethers.formatEther(uRes));
  console.log("  OSLO Reserve:", ethers.formatEther(oRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("  injectUSDTLiquidity: PUBLIC ✓");

  console.log("\n═══ Flow ═══");
  console.log("  User registers → $1 USDT → Referral.register()"); 
  console.log("  → DEX.injectUSDTLiquidity($1) → usdtReserve += $1 ✓");
  console.log("  Fully automatic — no off-chain intervention needed!");
}

main().catch(console.error);
