import { ethers } from "hardhat";

/**
 * Debug: Check registration fee flow
 * - Where is the $1 USDT? (FeeRouter? Referral contract? Lost?)
 * - Is osloDex correctly pointing to FeeRouter?
 * - Check recent registration events
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_ADDR = "0xb6D7294c2CCc8227ba802616BaE540D458A88800";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const FEE_ROUTER_ADDR = "0xdfc819733B0B46d51C3f180dc01648981F717097";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);

  // 1. Check referral's osloDex pointer
  const osloDex = await referral.osloDex();
  console.log("\n═══ 1. Referral Config ═══");
  console.log("  osloDex pointer:", osloDex);
  console.log("  Expected FeeRouter:", FEE_ROUTER_ADDR);
  console.log("  Match?", osloDex.toLowerCase() === FEE_ROUTER_ADDR.toLowerCase());

  // 2. Check USDT balances
  const referralBal = await usdt.balanceOf(REFERRAL_ADDR);
  const feeRouterBal = await usdt.balanceOf(FEE_ROUTER_ADDR);
  const dexBal = await usdt.balanceOf(DEX_ADDR);
  console.log("\n═══ 2. USDT Balances ═══");
  console.log("  Referral contract:", ethers.formatEther(referralBal), "USDT");
  console.log("  FeeRouter:", ethers.formatEther(feeRouterBal), "USDT");
  console.log("  DEX:", ethers.formatEther(dexBal), "USDT");

  // 3. Check totalFeesCollected & totalRegistered
  const totalFees = await referral.totalFeesCollected();
  const totalReg = await referral.totalRegistered();
  console.log("\n═══ 3. Registration Stats ═══");
  console.log("  totalRegistered:", totalReg.toString());
  console.log("  totalFeesCollected:", ethers.formatEther(totalFees), "USDT");
  console.log("  Expected fees if all paid:", totalReg.toString(), "USDT");

  // 4. Check USDT allowance from referral to FeeRouter
  const allowance = await usdt.allowance(REFERRAL_ADDR, FEE_ROUTER_ADDR);
  console.log("\n═══ 4. Allowance Check ═══");
  console.log("  Referral → FeeRouter allowance:", ethers.formatEther(allowance), "USDT");

  // 5. Check recent events on referral contract
  console.log("\n═══ 5. Recent Registration Events ═══");
  const filter = referral.filters.UserRegistered();
  const currentBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 5000); // Last ~5000 blocks
  try {
    const events = await referral.queryFilter(filter, fromBlock, currentBlock);
    console.log(`  Found ${events.length} UserRegistered events in last ~5000 blocks`);
    for (const evt of events.slice(-5)) { // Show last 5
      const e = evt as any;
      console.log(`    User: ${e.args[0]}, Referrer: ${e.args[1]}, Block: ${evt.blockNumber}`);
    }
  } catch (e: any) {
    console.log("  Could not query events:", e.message?.slice(0, 100));
  }

  // 6. Check RegistrationFeeProcessed events (means injection succeeded)
  console.log("\n═══ 6. Fee Processed Events ═══");
  const feeFilter = referral.filters.RegistrationFeeProcessed();
  try {
    const feeEvents = await referral.queryFilter(feeFilter, fromBlock, currentBlock);
    console.log(`  Found ${feeEvents.length} RegistrationFeeProcessed events`);
    for (const evt of feeEvents.slice(-5)) {
      const e = evt as any;
      console.log(`    User: ${e.args[0]}, Fee: ${ethers.formatEther(e.args[1])}, Block: ${evt.blockNumber}`);
    }
  } catch (e: any) {
    console.log("  Could not query events:", e.message?.slice(0, 100));
  }

  // 7. Try to check FeeRouter events
  console.log("\n═══ 7. FeeRouter Events ═══");
  try {
    const feeRouter = await ethers.getContractAt("FeeRouter", FEE_ROUTER_ADDR);
    const feeReceivedFilter = feeRouter.filters.FeeReceived();
    const routerEvents = await feeRouter.queryFilter(feeReceivedFilter, fromBlock, currentBlock);
    console.log(`  Found ${routerEvents.length} FeeReceived events`);
    for (const evt of routerEvents.slice(-5)) {
      const e = evt as any;
      console.log(`    From: ${e.args[0]}, Amount: ${ethers.formatEther(e.args[1])}, Block: ${evt.blockNumber}`);
    }
  } catch (e: any) {
    console.log("  Could not query FeeRouter events:", e.message?.slice(0, 100));
  }

  // 8. Diagnosis
  console.log("\n═══ DIAGNOSIS ═══");
  if (referralBal > 0n) {
    console.log("  ⚠️  $" + ethers.formatEther(referralBal) + " USDT stuck in referral contract!");
    console.log("     → The injectUSDTLiquidity call likely FAILED (caught by try/catch)");
    console.log("     → Possible causes:");
    console.log("       1. osloDex not pointing to FeeRouter at time of registration");
    console.log("       2. FeeRouter's safeTransferFrom reverted (allowance issue?)");
  }
  if (feeRouterBal > 0n) {
    console.log("  ✓ $" + ethers.formatEther(feeRouterBal) + " USDT in FeeRouter — ready to flush to DEX");
  }
  if (referralBal === 0n && feeRouterBal === 0n) {
    console.log("  ℹ️  No USDT in either contract. Fee may have been collected before FeeRouter was set.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
