import { ethers } from "hardhat";

const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";

async function main() {
  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const [deployer] = await ethers.getSigners();

  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  const refBal = await oslo.balanceOf(REFERRAL);
  console.log("Referral OSLO balance:  %s", ethers.formatEther(refBal));

  // Check DEX has getUSDTForOSLOOutput
  const dexAbi = ["function getUSDTForOSLOOutput(uint256) view returns (uint256)"];
  const dex = new ethers.Contract(DEX, dexAbi, deployer);
  try {
    const q = await dex.getUSDTForOSLOOutput(ethers.parseEther("1"));
    console.log("DEX.getUSDTForOSLOOutput(1 USDT): %s OSLO", ethers.formatEther(q));
  } catch (e: any) {
    console.log("DEX.getUSDTForOSLOOutput: ERROR -", e.message?.slice(0, 100));
  }

  // Check Referral commission state
  const refAbi = [
    "function totalCommissionsPaid() external view returns (uint256)",
    "function totalRegistered() external view returns (uint256)",
    "function referralRewards(address) external view returns (uint256)",
  ];
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);
  
  const paid = await ref.totalCommissionsPaid();
  console.log("Total commissions paid: %s USDT", ethers.formatEther(paid));
  
  const reg = await ref.totalRegistered();
  console.log("Total registered:       %s", reg.toString());

  // Deployer's pending referral rewards
  const deployerRewards = await ref.referralRewards(deployer.address);
  console.log("Deployer rewards:       %s USDT", ethers.formatEther(deployerRewards));
}

main().catch(console.error);
