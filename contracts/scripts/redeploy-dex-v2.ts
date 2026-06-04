import { ethers } from "hardhat";

/**
 * Redeploy OSLODexV2 with injectUSDTLiquidity support.
 * Then reconfigure vault, token whitelist, seed 1000 USDT + 100K OSLO.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO_ADDR = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const VAULT_ADDR = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const OLD_DEX_V2 = "0x1734613B59b0B976e180aF4007205A4F6D26f55f";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const RANK_ADDR = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const oslo = await ethers.getContractAt("IERC20", OSLO_ADDR);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_ADDR);

  // Step 1: Drain USDT & OSLO from old DEX V2 before redeploying
  console.log("\n── Step 1: Drain old DEX V2 ──");
  const oldDex = await ethers.getContractAt("OSLODexV2", OLD_DEX_V2);
  
  const oldUsdtBal = await usdt.balanceOf(OLD_DEX_V2);
  const oldOsloBal = await oslo.balanceOf(OLD_DEX_V2);
  console.log("  Old DEX USDT:", ethers.formatEther(oldUsdtBal));
  console.log("  Old DEX OSLO:", ethers.formatEther(oldOsloBal));

  if (oldUsdtBal > 0n) {
    const tx = await oldDex.drainUSDT(0);
    await tx.wait();
    console.log("  ✓ Drained USDT from old DEX");
  }

  // Step 2: Deploy new OSLODexV2
  console.log("\n── Step 2: Deploy new OSLODexV2 ──");
  const DexFactory = await ethers.getContractFactory("OSLODexV2");
  const newDex = await DexFactory.deploy(USDT_ADDR, OSLO_ADDR);
  await newDex.waitForDeployment();
  const NEW_DEX = await newDex.getAddress();
  console.log("  ✓ New OSLODexV2:", NEW_DEX);

  // Step 3: Configure new DEX (vault + timelock)
  console.log("\n── Step 3: Configure new DEX ──");
  let tx = await newDex.configure(VAULT_ADDR, deployer.address);
  await tx.wait();
  console.log("  ✓ DEX configured (vault + timelock)");

  // Step 4: Update vault to point to new DEX
  console.log("\n── Step 4: Update vault → new DEX ──");
  const vault = await ethers.getContractAt("OSLOVault", VAULT_ADDR);
  tx = await vault.configure(NEW_DEX, REFERRAL_ADDR, RANK_ADDR, deployer.address);
  await tx.wait();
  console.log("  ✓ Vault reconfigured with new DEX");

  // Step 5: Update OSLOToken whitelist
  console.log("\n── Step 5: Token whitelist ──");
  // Remove old DEX whitelist
  tx = await osloToken.setTaxWhitelist(OLD_DEX_V2, false);
  await tx.wait();
  console.log("  ✓ Old DEX removed from whitelist");

  // Add new DEX to whitelist
  tx = await osloToken.setTaxWhitelist(NEW_DEX, true);
  await tx.wait();
  console.log("  ✓ New DEX whitelisted");

  // Step 6: Add initial liquidity (100 USDT + 100K OSLO)
  console.log("\n── Step 6: Seed initial liquidity ──");
  const usdtSeed = ethers.parseEther("100");
  const osloSeed = ethers.parseEther("100000");

  tx = await usdt.approve(NEW_DEX, ethers.MaxUint256);
  await tx.wait();
  tx = await oslo.approve(NEW_DEX, ethers.MaxUint256);
  await tx.wait();

  tx = await newDex.addInitialLiquidity(usdtSeed, osloSeed);
  await tx.wait();
  console.log("  ✓ Initial liquidity: 100 USDT + 100K OSLO");

  // Step 7: Inject additional 900 USDT
  console.log("\n── Step 7: Inject 900 USDT ──");
  const injectAmount = ethers.parseEther("900");
  tx = await newDex.injectUSDTLiquidity(injectAmount);
  await tx.wait();
  console.log("  ✓ Injected 900 USDT");

  // Verify final state
  const reserves = await newDex.getReserves();
  const price = await newDex.getPrice();
  console.log("\n═══ Final State ═══");
  console.log("  New DEX:", NEW_DEX);
  console.log("  USDT reserve:", ethers.formatEther(reserves[0]));
  console.log("  OSLO reserve:", ethers.formatEther(reserves[1]));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
