import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Claim Error Root Cause ===\n");

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  const refAbi = [
    "function referralRewards(address) view returns (uint256)",
    "function totalCommissionsPaid() view returns (uint256)",
  ];
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);

  const dexAbi = [
    "function getPrice() view returns (uint256)",
    "function getUSDTForOSLOOutput(uint256) view returns (uint256)",
    "function getReserves() view returns (uint256, uint256)",
  ];
  const dex = new ethers.Contract(DEX, dexAbi, deployer);

  const vaultAbi = [
    "function getPendingRewards(address) view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  // Referral OSLO balance
  const refOslo = await oslo.balanceOf(REFERRAL);
  console.log("Referral OSLO Balance:", ethers.formatEther(refOslo));

  // DEX info
  const price = await dex.getPrice();
  const reserves = await dex.getReserves();
  console.log("DEX Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("DEX Reserves: USDT =", ethers.formatEther(reserves[0]), "| OSLO =", ethers.formatEther(reserves[1]));

  // Check known users with pending referral rewards
  const usersToCheck = [
    ethers.getAddress("0x47f8100afb5e03feb5f9d7b65f5e79d5a8fd3c2e"), // deployer
    ethers.getAddress("0x1d8896b5b5408fa0640cf942c17dded0c0992658"), // large depositor
  ];

  console.log("\n--- Pending Referral Rewards ---");
  for (const user of usersToCheck) {
    const pending = await ref.referralRewards(user);
    if (pending > 0n) {
      const osloNeeded = await dex.getUSDTForOSLOOutput(pending);
      console.log(`\n  User: ${user}`);
      console.log(`  Pending USDT: ${ethers.formatEther(pending)}`);
      console.log(`  OSLO needed:  ${ethers.formatEther(osloNeeded)}`);
      console.log(`  Referral has: ${ethers.formatEther(refOslo)}`);
      console.log(`  Can pay?      ${refOslo >= osloNeeded ? "YES" : "NO <<< WILL REVERT"}`);
    }
  }

  // Total commissions & rewards
  console.log("\n--- System State ---");
  console.log("Total Commissions Paid:", ethers.formatEther(await ref.totalCommissionsPaid()));
  console.log("Total Yield Rewards Paid:", ethers.formatEther(await vault.totalRewardsPaid()));

  // What amount can Referral cover?
  const maxUsdt = (refOslo * reserves[0]) / (reserves[1] + refOslo);
  console.log("\nMax claimable USDT with current 20 OSLO:", ethers.formatEther(maxUsdt));
}

main().catch(console.error);
