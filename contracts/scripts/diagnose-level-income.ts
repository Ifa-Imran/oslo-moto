import { ethers } from "hardhat";

const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const OLD_IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Level Income Diagnostic ===");

  // ─── Check Referral's pointers ────────────────────────────
  console.log("\n─── Referral Contract (%s) ───", REFERRAL);
  const refAbi = [
    "function investmentEngine() external view returns (address)",
    "function osloDex() external view returns (address)",
    "function setupComplete() external view returns (bool)",
    "function admin() external view returns (address)",
    "function timelock() external view returns (address)",
  ];
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);

  const refIE = await ref.investmentEngine();
  console.log("  investmentEngine: %s %s", refIE,
    refIE === VAULT ? "✓ (Vault)" :
    refIE === OLD_IE ? "✗ (OLD IE!)" :
    "✗ (UNKNOWN!)");

  const refDex = await ref.osloDex();
  console.log("  osloDex:          %s", refDex);

  const refSetup = await ref.setupComplete();
  console.log("  setupComplete:    %s", refSetup);

  // ─── Check Vault's pointers ────────────────────────────────
  console.log("\n─── Vault Contract (%s) ───", VAULT);
  const vaultAbi = [
    "function referral() external view returns (address)",
    "function osloDex() external view returns (address)",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  try {
    const vRef = await vault.referral();
    console.log("  referral:         %s %s", vRef,
      vRef === REFERRAL ? "✓" : "✗ WRONG!");
  } catch (e: any) {
    console.log("  referral: ERROR -", e.message?.slice(0, 80));
  }

  try {
    const vDex = await vault.osloDex();
    console.log("  osloDex:          %s", vDex);
  } catch (e: any) {
    console.log("  osloDex: ERROR -", e.message?.slice(0, 80));
  }

  // ─── Can Vault call distributeReferralCommission? ─────────
  // Test: call from deployer (should fail with OnlyInvestmentEngine)
  // Then check what address the Referral expects
  console.log("\n─── Authorization Check ───");
  const distAbi = [
    "function distributeReferralCommission(address user, uint256 profitAmount) external returns (uint256)",
  ];
  const refDist = new ethers.Contract(REFERRAL, distAbi, deployer);
  try {
    await refDist.distributeReferralCommission(deployer.address, ethers.parseEther("1"));
    console.log("  WARNING: distributeReferralCommission succeeded from deployer (no restriction!)");
  } catch (e: any) {
    const msg = e.message || "";
    if (msg.includes("OnlyInvestmentEngine")) {
      console.log("  distributeReferralCommission: correctly restricted to investmentEngine");
      console.log("  Expected caller: %s", refIE);
      console.log("  Vault address:    %s", VAULT);
      console.log("  Match: %s", refIE === VAULT ? "YES ✓" : "NO ✗ — THIS IS THE BUG!");
    } else {
      console.log("  distributeReferralCommission error:", msg.slice(0, 120));
    }
  }

  // ─── Summary ───────────────────────────────────────────────
  console.log("\n=== ROOT CAUSE ===");
  if (refIE !== VAULT) {
    console.log("BUG: Referral.investmentEngine = %s", refIE);
    console.log("     Should be Vault   = %s", VAULT);
    console.log("\nFIX: Call Referral.setInvestmentEngine(VAULT) via timelock");
  } else {
    console.log("✓ Referral's investmentEngine correctly points to Vault");
    console.log("  If level income still broken, next check: are users registered + have uplines?");
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
