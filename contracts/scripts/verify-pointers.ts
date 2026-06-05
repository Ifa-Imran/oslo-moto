import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const OLD_IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Post-Deploy Pointer Verification ===\n");

  const refAbi = [
    "function investmentEngine() view returns (address)",
    "function osloDex() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function admin() view returns (address)",
    "function timelock() view returns (address)",
  ];
  const vaultAbi = [
    "function referral() view returns (address)",
    "function osloDex() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function admin() view returns (address)",
    "function timelock() view returns (address)",
    "function depositsPaused() view returns (bool)",
    "function rewardWallet() view returns (address)",
  ];

  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  // Referral state
  console.log("── REFERRAL ──");
  const refIE = await ref.investmentEngine();
  const refDex = await ref.osloDex();
  const refSetup = await ref.setupComplete();
  const refAdmin = await ref.admin();
  const refTimelock = await ref.timelock();
  console.log("  investmentEngine:", refIE);
  console.log("  osloDex:         ", refDex);
  console.log("  setupComplete:   ", refSetup);
  console.log("  admin:           ", refAdmin);
  console.log("  timelock:        ", refTimelock);

  // Check if IE points to Vault or old IE
  if (refIE.toLowerCase() === VAULT.toLowerCase()) {
    console.log("  ✓ investmentEngine → Vault (CORRECT)");
  } else if (refIE.toLowerCase() === OLD_IE.toLowerCase()) {
    console.log("  ✗ investmentEngine → OLD IE (BROKEN!)");
  } else {
    console.log("  ? investmentEngine → UNKNOWN address");
  }

  // Vault state
  console.log("\n── VAULT ──");
  const vaultRef = await vault.referral();
  const vaultDex = await vault.osloDex();
  const vaultSetup = await vault.setupComplete();
  const vaultAdmin = await vault.admin();
  const vaultTimelock = await vault.timelock();
  const vaultPaused = await vault.depositsPaused();
  const vaultRewardWallet = await vault.rewardWallet();
  console.log("  referral:        ", vaultRef);
  console.log("  osloDex:         ", vaultDex);
  console.log("  setupComplete:   ", vaultSetup);
  console.log("  admin:           ", vaultAdmin);
  console.log("  timelock:        ", vaultTimelock);
  console.log("  depositsPaused:  ", vaultPaused);
  console.log("  rewardWallet:    ", vaultRewardWallet);

  // Cross-check DEX addresses
  console.log("\n── DEX ALIGNMENT ──");
  if (refDex.toLowerCase() === vaultDex.toLowerCase()) {
    console.log("  ✓ Referral.osloDex == Vault.osloDex:", refDex);
  } else {
    console.log("  ✗ DEX MISMATCH!");
    console.log("    Referral.osloDex:", refDex);
    console.log("    Vault.osloDex:   ", vaultDex);
  }

  // Frontend expected values
  console.log("\n── FRONTEND EXPECTED ──");
  console.log("  Frontend expects Vault DEX: 0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D");
  console.log("  Actual Vault DEX:          ", vaultDex);
  const frontendDex = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  if (vaultDex.toLowerCase() !== frontendDex.toLowerCase()) {
    console.log("  ⚠ DEX was redeployed! Frontend contracts.ts needs updating.");
  }

  // Check OSLO balances
  const osloAbi = ["function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract("0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c", osloAbi, deployer);
  console.log("\n── OSLO BALANCES ──");
  console.log("  Vault:    ", ethers.formatEther(await oslo.balanceOf(VAULT)));
  console.log("  Referral: ", ethers.formatEther(await oslo.balanceOf(REFERRAL)));
  console.log("  Deployer: ", ethers.formatEther(await oslo.balanceOf(deployer.address)));
  console.log("  Vault DEX:", ethers.formatEther(await oslo.balanceOf(vaultDex)));
  console.log("  Ref DEX:  ", ethers.formatEther(await oslo.balanceOf(refDex)));

  // If DEX addresses differ, also check old DEX
  if (refDex.toLowerCase() !== vaultDex.toLowerCase()) {
    console.log("  Old FE DEX:", ethers.formatEther(await oslo.balanceOf(frontendDex)));
  }

  // Summary
  console.log("\n═══ FIX NEEDED ═══");
  if (refIE.toLowerCase() !== VAULT.toLowerCase()) {
    console.log("  1. Referral.configure(VAULT, currentDex, currentTimelock) — fix investmentEngine pointer");
  }
  if (!refSetup) {
    console.log("     (configure still callable — setupComplete is false)");
  } else {
    console.log("     ✗ setupComplete=true — need timelock to call setInvestmentEngine!");
  }
}

main().catch(console.error);
