import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");
  console.log("Needed: ~0.02 BNB for deployment");
  console.log("Missing:", ethers.formatEther(ethers.parseEther("0.02") - balance), "BNB");
  console.log("\nGet testnet BNB from:");
  console.log("https://testnet.bnbchain.org/faucet-smart");
}

main().catch(console.error);
