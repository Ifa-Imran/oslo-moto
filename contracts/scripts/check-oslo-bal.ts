import { ethers } from "hardhat";

async function main() {
  const [d] = await ethers.getSigners();
  const OSLO_ADDR = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const oslo = await ethers.getContractAt("IERC20", OSLO_ADDR);
  const bal = await oslo.balanceOf(d.address);
  console.log("Deployer OSLO:", ethers.formatEther(bal));
}

main().catch(console.error);
