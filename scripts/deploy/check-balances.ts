import { ethers } from "hardhat";

async function main() {
  const osloToken = await ethers.getContractAt("OsloToken", "0x8E6dAF6109377e77c8676b8848835964b5B46C2F");
  const [deployer] = await ethers.getSigners();
  const balance = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO balance:", ethers.formatEther(balance));
  const oldDexBalance = await osloToken.balanceOf("0xA1eEb2273fdb1Ba814e3172cd72d7E37197a9148");
  console.log("Old DEX OSLO balance:", ethers.formatEther(oldDexBalance));
  const newDexBalance = await osloToken.balanceOf("0xa2e54E427A148a9C8d0120943B808A9754ae037E");
  console.log("New DEX OSLO balance:", ethers.formatEther(newDexBalance));
  // Check if deployer has MINTER_ROLE
  const MINTER_ROLE = await osloToken.MINTER_ROLE();
  const hasMinter = await osloToken.hasRole(MINTER_ROLE, deployer.address);
  console.log("Deployer has MINTER_ROLE:", hasMinter);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
