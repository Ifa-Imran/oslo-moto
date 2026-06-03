import { ethers } from "hardhat";

/**
 * Diagnose why drainUSDT didn't work on OSLODEX
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX_ADDR = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";

  const dex = await ethers.getContractAt("OSLODEX", DEX_ADDR);

  // Check admin
  const admin = await dex.admin();
  console.log("\nDEX admin:", admin);
  console.log("Deployer is admin:", admin.toLowerCase() === deployer.address.toLowerCase());

  // Check setup
  const setupComplete = await dex.setupComplete();
  console.log("setupComplete:", setupComplete);

  // Check timelock
  const timelock = await dex.timelock();
  console.log("timelock:", timelock);

  // Check LM
  const lm = await dex.liquidityManager();
  console.log("liquidityManager:", lm);

  // Check IE
  const ie = await dex.investmentEngine();
  console.log("investmentEngine:", ie);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
