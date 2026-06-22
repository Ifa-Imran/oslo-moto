import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OsloDAO with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Existing contract addresses from previous deployment
  const usdtAddress = "0xd066492bfDE1313EF3C7e4f4D875a60B0c7a5A50";
  const engineAddress = "0xA480c43072105648404a9Eb9E516F25C9b468FE9";
  const registryAddress = "0x868ac359d31c5083Aff193a829eF0d74AF3F610B";

  // Deploy OsloDAO
  console.log("Deploying OsloDAO...");
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(usdtAddress, engineAddress);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("OsloDAO deployed to:", daoAddress);

  // Wire referral registry
  await dao.setReferralRegistry(registryAddress);
  console.log("Set referral registry:", registryAddress);

  // Update .env.local
  const envPath = "frontend/.env.local";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(/NEXT_PUBLIC_OSLO_DAO_ADDRESS=.*/, "NEXT_PUBLIC_OSLO_DAO_ADDRESS=" + daoAddress);
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env.local with new OsloDAO address");

  // Update deployments-97.json
  const depPath = "deployments-97.json";
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  dep.contracts.OsloDAO = daoAddress;
  dep.timestamp = new Date().toISOString();
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("Updated deployments-97.json");

  console.log("\n========================================");
  console.log("OsloDAO deployed and wired successfully!");
  console.log("New OsloDAO address:", daoAddress);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
