import { ethers } from "hardhat";

/**
 * Deploy FeeRouter and update referral contract's osloDex pointer.
 * This routes the $1 registration fee through the FeeRouter.
 * Admin periodically flushes accumulated USDT to DEX liquidity.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const VAULT_ADDR = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const RANK_ADDR = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";

  // Step 1: Deploy FeeRouter
  console.log("\n── Step 1: Deploy FeeRouter ──");
  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouterFactory.deploy(USDT_ADDR, DEX_ADDR);
  await feeRouter.waitForDeployment();
  const FEE_ROUTER_ADDR = await feeRouter.getAddress();
  console.log("  ✓ FeeRouter deployed:", FEE_ROUTER_ADDR);

  // Step 2: Update referral contract's osloDex to point to FeeRouter
  console.log("\n── Step 2: Update referral osloDex → FeeRouter ──");
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);
  
  // Check current state
  const currentOsloDex = await referral.osloDex();
  console.log("  Current osloDex:", currentOsloDex);
  
  // Call configure to update osloDex
  // configure(investmentEngine, osloDex, timelock)
  const currentIE = await referral.investmentEngine();
  const currentTimelock = await referral.timelock();
  console.log("  Current IE:", currentIE);
  console.log("  Current Timelock:", currentTimelock);
  
  const tx = await referral.configure(
    currentIE || VAULT_ADDR,
    FEE_ROUTER_ADDR,
    currentTimelock || deployer.address
  );
  await tx.wait();
  console.log("  ✓ Referral osloDex updated to FeeRouter");

  // Verify
  const newOsloDex = await referral.osloDex();
  console.log("  Verified osloDex:", newOsloDex);
  console.log("  Points to FeeRouter?", newOsloDex.toLowerCase() === FEE_ROUTER_ADDR.toLowerCase());

  console.log("\n═══ Summary ═══");
  console.log("  FeeRouter:", FEE_ROUTER_ADDR);
  console.log("  Referral osloDex → FeeRouter ✓");
  console.log("  DEX untouched:", DEX_ADDR);
  console.log("\n  Flow: User registers → $1 USDT → Referral → FeeRouter (holds it)");
  console.log("  Admin periodically: flush() → injectUSDTLiquidity() → DEX liquidity");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
