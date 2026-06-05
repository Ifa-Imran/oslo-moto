import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  const deployerBNB = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer BNB:", ethers.formatEther(deployerBNB));

  const usdtToken = await ethers.getContractAt("IERC20", USDT);
  const osloToken = await ethers.getContractAt("IERC20", OSLO);

  const usdtBal = await usdtToken.balanceOf(deployer.address);
  const osloBal = await osloToken.balanceOf(deployer.address);
  console.log("Deployer USDT:", ethers.formatUnits(usdtBal, 18));
  console.log("Deployer OSLO:", ethers.formatUnits(osloBal, 18));

  // ─── Step 1: Deploy new DEX ───
  console.log("\n═══ Deploying New DEX ═══");
  const OSLODexV2 = await ethers.getContractFactory("OSLODexV2");
  const newDex = await OSLODexV2.deploy(USDT, OSLO);
  await newDex.waitForDeployment();
  const NEW_DEX = await newDex.getAddress();
  console.log("New DEX:", NEW_DEX);

  // ─── Step 2: Read timelock ───
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const vTimelock = await vault.timelock();
  console.log("Vault timelock:", vTimelock);

  // ─── Step 3: Configure DEX (vault, timelock, investmentEngine) ───
  console.log("\n── Configuring DEX ──");
  const txConfig = await newDex.configure(VAULT, vTimelock, IE);
  await txConfig.wait();
  console.log("✓ DEX configured");

  // ─── Step 4: Add initial liquidity ───
  // Use the same ratio: ~10 USDT : 1 OSLO for ~$10 price
  const usdtSeed = ethers.parseUnits("10835", 18);
  const osloSeed = ethers.parseUnits("1083", 18);

  console.log("\n── Seeding Liquidity ──");
  const txApprUSDT = await usdtToken.approve(NEW_DEX, usdtSeed);
  await txApprUSDT.wait();
  const txApprOSLO = await osloToken.approve(NEW_DEX, osloSeed);
  await txApprOSLO.wait();

  const txLiq = await newDex.addInitialLiquidity(usdtSeed, osloSeed);
  await txLiq.wait();
  console.log("✓ Liquidity seeded:", ethers.formatUnits(usdtSeed, 18), "USDT +", ethers.formatUnits(osloSeed, 18), "OSLO");

  const price = await newDex.getPrice();
  console.log("Price:", ethers.formatUnits(price, 18), "USDT/OSLO");

  // ─── Step 5: Update Vault → new DEX ───
  console.log("\n── Updating Vault ──");
  const vRef = await vault.referral();
  const vRank = await vault.rankSystem();
  const txVault = await vault.configure(NEW_DEX, vRef, vRank, vTimelock);
  await txVault.wait();
  console.log("✓ Vault.osloDex →", NEW_DEX);

  // ─── Step 6: Update Referral → new DEX ───
  console.log("\n── Updating Referral ──");
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const rTL = await referral.timelock();
  const txRef = await referral.configure(IE, NEW_DEX, rTL);
  await txRef.wait();
  console.log("✓ Referral.osloDex →", NEW_DEX);

  // ─── Step 7: Update InvestmentEngine → new DEX ───
  console.log("\n── Updating InvestmentEngine ──");
  const ieContract = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  const ieTreasury = await ieContract.treasury();
  const ieRef = await ieContract.referral();
  const ieRank = await ieContract.rankSystem();
  const ieTimelock = await ieContract.timelock();
  const txIE = await ieContract.configure(ieTreasury, ieRef, ieRank, NEW_DEX, ieTimelock);
  await txIE.wait();
  console.log("✓ IE.osloDex →", NEW_DEX);

  // ─── Verify ───
  console.log("\n═══ Verification ═══");
  const vAfter = await vault.osloDex();
  const rAfter = await referral.osloDex();
  const ieAfter = await ieContract.osloDex();
  console.log("Vault.osloDex:", vAfter, vAfter === NEW_DEX ? "✓" : "✗");
  console.log("Referral.osloDex:", rAfter, rAfter === NEW_DEX ? "✓" : "✗");
  console.log("IE.osloDex:", ieAfter, ieAfter === NEW_DEX ? "✓" : "✗");

  // Test getUSDTForOSLOOutput
  try {
    const q = await newDex.getUSDTForOSLOOutput(ethers.parseUnits("1", 18));
    console.log("getUSDTForOSLOOutput(1 USDT):", ethers.formatUnits(q, 18), "OSLO ✓");
  } catch (e: any) {
    console.log("getUSDTForOSLOOutput: ✗", e.reason || e.message);
  }

  console.log("\n═══ DONE ═══");
  console.log("New DEX:", NEW_DEX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
