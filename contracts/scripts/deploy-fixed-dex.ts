import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // ─── Current on-chain addresses ───
  const OLD_DEX = "0x5A7C5046FbB6aDdF7Ae36D08Ab0A603be694798C";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const RANK_SYSTEM = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const TREASURY = "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer BNB:", ethers.formatEther(deployerBalance));

  // ─── Step 1: Check old DEX reserves ───
  console.log("\n═══ Old DEX State ═══");
  const oldDex = await ethers.getContractAt("OSLODexV2", OLD_DEX);
  const [usdtRes, osloRes] = await oldDex.getReserves();
  console.log("USDT Reserve:", ethers.formatUnits(usdtRes, 18));
  console.log("OSLO Reserve:", ethers.formatUnits(osloRes, 18));
  const oldPrice = await oldDex.getPrice();
  console.log("Price:", ethers.formatUnits(oldPrice, 18), "USDT/OSLO");

  // ─── Step 2: Drain USDT from old DEX ───
  console.log("\n── Draining USDT ──");
  const usdtToken = await ethers.getContractAt("IERC20", USDT);
  const usdtBefore = await usdtToken.balanceOf(deployer.address);
  console.log("Deployer USDT before:", ethers.formatUnits(usdtBefore, 18));

  const txDrain = await oldDex.drainUSDT(0); // 0 = all
  await txDrain.wait();
  const usdtAfter = await usdtToken.balanceOf(deployer.address);
  console.log("Deployer USDT after:", ethers.formatUnits(usdtAfter, 18));
  console.log("USDT drained:", ethers.formatUnits(usdtAfter - usdtBefore, 18));

  // ─── Step 3: Drain OSLO from old DEX ───
  console.log("\n── Draining OSLO ──");
  const osloToken = await ethers.getContractAt("IERC20", OSLO);
  const osloBefore = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO before:", ethers.formatUnits(osloBefore, 18));

  const txDrainOslo = await oldDex.drainOSLO(0);
  await txDrainOslo.wait();
  const osloAfter = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO after:", ethers.formatUnits(osloAfter, 18));
  console.log("OSLO drained:", ethers.formatUnits(osloAfter - osloBefore, 18));

  // ─── Step 4: Deploy new DEX ───
  console.log("\n═══ Deploying New DEX ═══");
  const OSLODexV2 = await ethers.getContractFactory("OSLODexV2");
  const newDex = await OSLODexV2.deploy(USDT, OSLO);
  await newDex.waitForDeployment();
  const NEW_DEX = await newDex.getAddress();
  console.log("New DEX:", NEW_DEX);

  // ─── Step 5: Read timelock addresses ───
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const vTimelock = await vault.timelock();
  console.log("Vault timelock:", vTimelock);

  const ieContract = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  const ieTimelock = await ieContract.timelock();
  console.log("IE timelock:", ieTimelock);

  // ─── Step 6: Configure new DEX ───
  console.log("\n── Configuring DEX ──");
  const txConfig = await newDex.configure(VAULT, vTimelock, IE);
  await txConfig.wait();
  console.log("✓ DEX configured: vault=", VAULT, "timelock=", vTimelock, "ie=", IE);

  // ─── Step 7: Add initial liquidity ───
  console.log("\n── Adding Initial Liquidity ──");
  const usdtDexAmount = usdtAfter - usdtBefore; // Full drained amount
  const osloDexAmount = osloRes; // Same OSLO as before to maintain price

  // Approve USDT and OSLO
  const txApprUSDT = await usdtToken.approve(NEW_DEX, usdtDexAmount);
  await txApprUSDT.wait();
  const txApprOSLO = await osloToken.approve(NEW_DEX, osloDexAmount);
  await txApprOSLO.wait();

  const txLiq = await newDex.addInitialLiquidity(usdtDexAmount, osloDexAmount);
  await txLiq.wait();
  console.log("✓ Liquidity added:", ethers.formatUnits(usdtDexAmount, 18), "USDT +", ethers.formatUnits(osloDexAmount, 18), "OSLO");

  const newPrice = await newDex.getPrice();
  console.log("New DEX price:", ethers.formatUnits(newPrice, 18), "USDT/OSLO");

  // ─── Step 8: Update Vault → new DEX ───
  console.log("\n── Updating Vault ──");
  const vRef = await vault.referral();
  const vRank = await vault.rankSystem();
  const txVault = await vault.configure(NEW_DEX, vRef, vRank, vTimelock);
  await txVault.wait();
  console.log("✓ Vault.osloDex →", NEW_DEX);

  // ─── Step 9: Update Referral → new DEX ───
  console.log("\n── Updating Referral ──");
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const rTL = await referral.timelock();
  const txRef = await referral.configure(IE, NEW_DEX, rTL);
  await txRef.wait();
  console.log("✓ Referral.osloDex →", NEW_DEX);

  // ─── Step 10: Update InvestmentEngine → new DEX ───
  console.log("\n── Updating InvestmentEngine ──");
  const ieTreasury = await ieContract.treasury();
  const ieRef = await ieContract.referral();
  const ieRank = await ieContract.rankSystem();
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

  // Verify processDeposit exists
  try {
    const testQuote = await newDex.getUSDTForOSLOOutput(ethers.parseUnits("1", 18));
    console.log("\ngetUSDTForOSLOOutput(1 USDT):", ethers.formatUnits(testQuote, 18), "OSLO ✓");
  } catch (e) {
    console.log("\ngetUSDTForOSLOOutput: ✗ FAILED");
  }

  console.log("\n═══ DONE ═══");
  console.log("New DEX:", NEW_DEX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
