import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Redeploy OsloDAO with permissionless distributeRoyalties + claimRoyalty + cycle tracking.
 * Also wires the new DAO to the existing InvestmentEngine (0.5% DAO funding).
 */

// Existing deployed contracts (BSC Testnet)
const INVESTMENT_ENGINE = "0xA480c43072105648404a9Eb9E516F25C9b468FE9";
const USDT_ADDRESS = "0xd066492bfDE1313EF3C7e4f4D875a60B0c7a5A50";
const REFERRAL_REGISTRY = "0x868ac359d31c5083Aff193a829eF0d74AF3F610B";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying OsloDAO with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // 1. Deploy new OsloDAO
  console.log("\n1. Deploying new OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(USDT_ADDRESS, INVESTMENT_ENGINE);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("   New OsloDAO deployed to:", daoAddress);

  // 2. Wire referral registry
  console.log("\n2. Wiring ReferralRegistry...");
  await dao.setReferralRegistry(REFERRAL_REGISTRY);
  console.log("   ReferralRegistry wired.");

  // 3. Set DAO contract on InvestmentEngine (enables 0.5% USDT funding)
  console.log("\n3. Setting DAO contract on InvestmentEngine...");
  const engineABI = ["function setDAOContract(address) external", "function daoContract() view returns (address)"];
  const engine = new ethers.Contract(INVESTMENT_ENGINE, engineABI, deployer);
  await engine.setDAOContract(daoAddress);
  console.log("   DAO contract set on InvestmentEngine.");
  const confirmedDao = await engine.daoContract();
  console.log("   Confirmed daoContract:", confirmedDao);

  // 4. Update frontend .env.local
  console.log("\n4. Updating frontend .env.local...");
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_OSLO_DAO_ADDRESS=.*/,
    `NEXT_PUBLIC_OSLO_DAO_ADDRESS=${daoAddress}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log("   .env.local updated.");

  // Summary
  console.log("\n========================================");
  console.log("OSLO DAO REDEPLOYED");
  console.log("========================================");
  console.log("New OsloDAO:        ", daoAddress);
  console.log("InvestmentEngine:   ", INVESTMENT_ENGINE);
  console.log("ReferralRegistry:   ", REFERRAL_REGISTRY);
  console.log("========================================");
  console.log("\nNew features:");
  console.log("  - claimRoyalty(): Individual members can claim their DAO royalty");
  console.log("  - distributeRoyalties(): Permissionless (anyone can call)");
  console.log("  - Auto-syncs totalProtocolTurnover on each cycle");
  console.log("  - 0.5% of each deposit now funds the DAO contract");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
