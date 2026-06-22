import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const vaultAddr = "0x546fDa6FABA141059d55B38e4592D7969123B827";
  const vault = await ethers.getContractAt("RewardVault", vaultAddr);

  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  const hasAdmin = await vault.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  console.log("Deployer has DEFAULT_ADMIN_ROLE on vault:", hasAdmin);

  const hasEngine = await vault.hasRole(ENGINE_ROLE, deployer.address);
  console.log("Deployer has ENGINE_ROLE on vault:", hasEngine);

  // Check old engine
  const oldEngine = "0xc7D1Fcd18110D2F93a93f61f6A1dc36504664082";
  const oldEngineHasRole = await vault.hasRole(ENGINE_ROLE, oldEngine);
  console.log("Old engine has ENGINE_ROLE on vault:", oldEngineHasRole);

  // Check OSLO balance of vault
  const osloToken = await ethers.getContractAt("OsloToken", "0x8E6dAF6109377e77c8676b8848835964b5B46C2F");
  const vaultOslo = await osloToken.balanceOf(vaultAddr);
  console.log("Vault OSLO balance:", ethers.formatEther(vaultOslo));

  // Try granting again and check
  console.log("\nGranting ENGINE_ROLE again...");
  const tx = await vault.grantRole(ENGINE_ROLE, deployer.address);
  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status);
  console.log("Gas used:", receipt?.gasUsed.toString());

  const hasEngineAfter = await vault.hasRole(ENGINE_ROLE, deployer.address);
  console.log("Deployer has ENGINE_ROLE after grant:", hasEngineAfter);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
