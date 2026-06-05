import { ethers } from "hardhat";

async function main() {
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const DEX_V3 = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";

  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const osloToken = await ethers.getContractAt("IERC20", OSLO_TOKEN);
  const usdt = await ethers.getContractAt("IERC20", USDT);

  // Check Vault state
  const admin = await vault.admin();
  const setupComplete = await vault.setupComplete();
  const osloDex = await vault.osloDex();
  const referral = await vault.referral();
  const rankSystem = await vault.rankSystem();
  const totalDeposited = await vault.totalDeposited();
  const totalWithdrawn = await vault.totalWithdrawn();
  const totalRewardsPaid = await vault.totalRewardsPaid();
  const depositsPaused = await vault.depositsPaused();

  console.log("\n=== OSLOVault State ===");
  console.log("Admin:", admin);
  console.log("Setup Complete:", setupComplete);
  console.log("Deposits Paused:", depositsPaused);
  console.log("osloDex:", osloDex);
  console.log("Referral:", referral);
  console.log("RankSystem:", rankSystem);
  console.log("totalDeposited:", ethers.formatUnits(totalDeposited, 18), "USDT");
  console.log("totalWithdrawn:", ethers.formatUnits(totalWithdrawn, 18), "USDT");
  console.log("totalRewardsPaid:", ethers.formatUnits(totalRewardsPaid, 18), "USDT");

  // Check balances
  const vaultOslo = await osloToken.balanceOf(VAULT);
  const vaultUsdt = await usdt.balanceOf(VAULT);
  console.log("\n=== Vault Balances ===");
  console.log("OSLO:", ethers.formatUnits(vaultOslo, 18));
  console.log("USDT:", ethers.formatUnits(vaultUsdt, 18));

  // Check DEX state
  const dexOslo = await osloToken.balanceOf(DEX_V3);
  const dexUsdt = await usdt.balanceOf(DEX_V3);
  console.log("\n=== DEX V3 Balances ===");
  console.log("OSLO:", ethers.formatUnits(dexOslo, 18));
  console.log("USDT:", ethers.formatUnits(dexUsdt, 18));

  // Check deployer
  const [deployer] = await ethers.getSigners();
  console.log("\n=== Deployer ===");
  console.log("Address:", deployer.address);
  console.log("Can migrate:", admin.toLowerCase() === deployer.address.toLowerCase() && !setupComplete);
}

main().catch(console.error);
