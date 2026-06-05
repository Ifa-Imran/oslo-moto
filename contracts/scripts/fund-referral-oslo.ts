import { ethers } from "hardhat";

const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Fund Referral with OSLO ===\n");

  const erc20 = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];
  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  // Check current balances
  const deployerBal = await oslo.balanceOf(deployer.address);
  const refBal = await oslo.balanceOf(REFERRAL);
  console.log("Before:");
  console.log("  Deployer OSLO:", ethers.formatEther(deployerBal));
  console.log("  Referral OSLO:", ethers.formatEther(refBal));

  // Send 1000 OSLO to Referral (covers ~$10K in commission payouts at current price)
  const amount = ethers.parseEther("1000");
  console.log("\nSending 1000 OSLO to Referral...");

  if (deployerBal < amount) {
    console.log("ERROR: Deployer doesn't have enough OSLO!");
    console.log("Need 1000, have", ethers.formatEther(deployerBal));
    return;
  }

  const tx = await oslo.transfer(REFERRAL, amount);
  console.log("TX:", tx.hash);
  await tx.wait();
  console.log("Confirmed!");

  // Verify
  const newRefBal = await oslo.balanceOf(REFERRAL);
  console.log("\nAfter:");
  console.log("  Referral OSLO:", ethers.formatEther(newRefBal));
  console.log("\nReferral can now cover ~$10K+ in commission claims.");
}

main().catch(console.error);
