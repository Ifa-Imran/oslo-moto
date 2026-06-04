import { ethers } from "hardhat";

/**
 * Deploy new OSLODexV2 with public injectUSDTLiquidity.
 * Seed with drained USDT + fresh OSLO from deployer.
 * Then point all contracts to the new DEX.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO_ADDR = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const VAULT_ADDR = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const FEE_ROUTER_V2 = "0x0B387e46a4c7dB77bD5BC1C1c8C3d4d5F0bd6D24";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const oslo = await ethers.getContractAt("IERC20", OSLO_ADDR);

  // ─── Step 1: Check deployer balances ───
  const usdtBal = await usdt.balanceOf(deployer.address);
  const osloBal = await oslo.balanceOf(deployer.address);
  console.log("\n═══ Deployer Balances ═══");
  console.log("  USDT:", ethers.formatEther(usdtBal));
  console.log("  OSLO:", ethers.formatEther(osloBal));

  // ─── Step 2: Deploy new DEX ───
  console.log("\n── Step 2: Deploy new OSLODexV2 ──");
  const OSLODexV2 = await ethers.getContractFactory("OSLODexV2");
  const newDex = await OSLODexV2.deploy(USDT_ADDR, OSLO_ADDR);
  await newDex.waitForDeployment();
  const newDexAddr = await newDex.getAddress();
  console.log("  ✓ Deployed at:", newDexAddr);

  // ─── Step 3: Configure vault ───
  console.log("\n── Step 3: Configure vault ──");
  const tx1 = await newDex.configure(VAULT_ADDR, deployer.address); // timelock = deployer for now
  await tx1.wait();
  console.log("  ✓ Vault set to:", VAULT_ADDR);

  // ─── Step 4: Seed initial liquidity ───
  // Use 17,000 OSLO (matching old DEX's ~16,949 OSLO)
  const seedOSLO = ethers.parseEther("17000");
  const seedUSDT = usdtBal; // All 5,902 USDT

  console.log("\n── Step 4: Seed liquidity ──");
  console.log("  USDT:", ethers.formatEther(seedUSDT));
  console.log("  OSLO:", ethers.formatEther(seedOSLO));

  // Approve both tokens
  const approveUsdt = await usdt.approve(newDexAddr, seedUSDT);
  await approveUsdt.wait();
  const approveOslo = await oslo.approve(newDexAddr, seedOSLO);
  await approveOslo.wait();
  console.log("  ✓ Approved USDT + OSLO");

  // Add initial liquidity
  const tx2 = await newDex.addInitialLiquidity(seedUSDT, seedOSLO);
  await tx2.wait();
  console.log("  ✓ Liquidity seeded");

  // Verify
  const [uRes, oRes] = await newDex.getReserves();
  const price = await newDex.getPrice();
  console.log("\n═══ New DEX State ═══");
  console.log("  USDT Reserve:", ethers.formatEther(uRes));
  console.log("  OSLO Reserve:", ethers.formatEther(oRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");

  // ─── Step 5: Point FeeRouterV2 to new DEX ───
  console.log("\n── Step 5: Update FeeRouterV2 ──");
  const feeRouter = await ethers.getContractAt("FeeRouterV2", FEE_ROUTER_V2);
  const tx3 = await feeRouter.setDex(newDexAddr);
  await tx3.wait();
  console.log("  ✓ FeeRouterV2.dex →", newDexAddr);

  // ─── Step 6: Point Referral directly to new DEX ───
  // Since new DEX has public injectUSDTLiquidity, referral can call it directly.
  // No need for FeeRouterV2 intermediary anymore.
  console.log("\n── Step 6: Update Referral osloDex → new DEX ──");
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);
  const tx4 = await referral.configure(
    await referral.investmentEngine(),
    newDexAddr, // Direct to DEX — injectUSDTLiquidity is public now!
    await referral.timelock()
  );
  await tx4.wait();
  console.log("  ✓ Referral.osloDex →", newDexAddr);
  console.log("  ✓ Registration fees flow directly: Referral → DEX (no FeeRouter needed!)");

  // ─── Final Summary ───
  console.log("\n═══ DEPLOYMENT COMPLETE ═══");
  console.log("  New DEX:", newDexAddr);
  console.log("  USDT:", ethers.formatEther(uRes));
  console.log("  OSLO:", ethers.formatEther(oRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("  injectUSDTLiquidity: PUBLIC ✓");
  console.log("\n  Flow: User registers → $1 USDT → Referral → DEX.injectUSDTLiquidity → DONE!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
