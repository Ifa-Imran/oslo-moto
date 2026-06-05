import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const USER = "0x8F...6Df8"; // Will check with full address from on-chain

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Claim Error Diagnosis ===\n");

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  const vaultAbi = [
    "function getPendingRewards(address) view returns (uint256)",
    "function userPools(address) view returns (uint256 totalBalance, uint256 totalClaimed, uint256 maxReturn, uint256 accruedRewards, uint256 lastClaimTime, uint256 lastDepositTime, uint256 totalCombinedEarnings, bool active)",
    "function minClaimThreshold() view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  const dexAbi = [
    "function getPrice() view returns (uint256)",
    "function getReserves() view returns (uint256 usdtReserve, uint256 osloReserve)",
  ];
  const dex = new ethers.Contract(DEX, dexAbi, deployer);

  // 1. OSLO balances
  const vaultOslo = await oslo.balanceOf(VAULT);
  const referralOslo = await oslo.balanceOf(REFERRAL);
  const dexOslo = await oslo.balanceOf(DEX);
  console.log("OSLO Balances:");
  console.log("  Vault:    ", ethers.formatEther(vaultOslo));
  console.log("  Referral: ", ethers.formatEther(referralOslo));
  console.log("  DEX:      ", ethers.formatEther(dexOslo));

  // 2. DEX price
  const price = await dex.getPrice();
  console.log("\nDEX Price:", ethers.formatEther(price), "USDT per OSLO");
  const reserves = await dex.getReserves();
  console.log("DEX Reserves: USDT=", ethers.formatEther(reserves[0]), " OSLO=", ethers.formatEther(reserves[1]));

  // 3. Check known depositor (the large one from previous diagnostics)
  const knownUser = "0x1d8896b5B5408Fa0640CF942c17DDED0C0992658";
  const pending = await vault.getPendingRewards(knownUser);
  const pool = await vault.userPools(knownUser);
  console.log("\nKnown Depositor (0x1d88...):");
  console.log("  Pending USDT:   ", ethers.formatEther(pending));
  console.log("  Total Balance:  ", ethers.formatEther(pool.totalBalance));
  console.log("  Total Claimed:  ", ethers.formatEther(pool.totalClaimed));
  console.log("  Max Return:     ", ethers.formatEther(pool.maxReturn));
  console.log("  Active:         ", pool.active);

  // 4. Calculate OSLO needed for claim
  if (pending > 0n && price > 0n) {
    const osloNeeded = (pending * ethers.parseEther("1")) / price;
    console.log("\n  OSLO needed for claim:", ethers.formatEther(osloNeeded));
    console.log("  Vault has enough?    ", vaultOslo >= osloNeeded ? "YES" : "NO <<<");
    if (vaultOslo < osloNeeded) {
      const deficit = osloNeeded - vaultOslo;
      console.log("  DEFICIT:             ", ethers.formatEther(deficit), "OSLO");
    }
  }

  // 5. Min claim threshold
  const minThreshold = await vault.minClaimThreshold();
  console.log("\nMin Claim Threshold:", ethers.formatEther(minThreshold), "USDT");
  console.log("Total Rewards Paid: ", ethers.formatEther(await vault.totalRewardsPaid()));
}

main().catch(console.error);
