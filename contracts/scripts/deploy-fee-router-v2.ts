import { ethers } from "hardhat";

/**
 * Deploy FeeRouterV2 — auto-forwards registration fees to DEX.
 * No manual flush needed.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

  // 1. Deploy FeeRouterV2
  console.log("\n── Deploying FeeRouterV2 ──");
  const FeeRouterV2 = await ethers.getContractFactory("FeeRouterV2");
  const feeRouter = await FeeRouterV2.deploy(USDT_ADDR, DEX_ADDR);
  await feeRouter.waitForDeployment();
  const routerAddr = await feeRouter.getAddress();
  console.log("  ✓ FeeRouterV2 deployed at:", routerAddr);

  // 2. Update referral's osloDex to point to FeeRouterV2
  console.log("\n── Updating Referral osloDex → FeeRouterV2 ──");
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);
  const oldOsloDex = await referral.osloDex();
  console.log("  Old osloDex:", oldOsloDex);

  const tx = await referral.configure(
    await referral.investmentEngine(),
    routerAddr, // new osloDex = FeeRouterV2
    await referral.timelock()
  );
  await tx.wait();
  const newOsloDex = await referral.osloDex();
  console.log("  ✓ New osloDex:", newOsloDex);

  // 3. Verify
  console.log("\n═══ VERIFICATION ═══");
  console.log("  FeeRouterV2:", routerAddr);
  console.log("  FeeRouterV2.dex:", await feeRouter.dex());
  console.log("  Referral.osloDex:", newOsloDex);
  console.log("  Match?", newOsloDex.toLowerCase() === routerAddr.toLowerCase());

  console.log("\n═══ FLOW ═══");
  console.log("  User registers → $1 USDT → Referral → FeeRouterV2 → DEX (automatic!)");
  console.log("  No manual flush needed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
