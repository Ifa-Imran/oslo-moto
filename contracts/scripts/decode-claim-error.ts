import { ethers } from "hardhat";

async function main() {
  // Decode error selector 0xc2caa2a6
  const errors = [
    "NoBalance()",
    "PoolInactive()",
    "NothingToClaim()",
    "BelowWithdrawalThreshold()",
    "DEXNotPriced()",
    "InsufficientOsloReserve()",
    "NotRegistered()",
    "InvalidExitPercentage()",
    "ExitWindowExpired()",
    "SetupAlreadyComplete()",
    "DepositsPaused()",
    "BelowMinimumDeposit()",
    "InvestmentCapReached()",
    "AmountMustBeGreaterThanZero()",
  ];

  console.log("=== Error Selector Lookup ===\n");
  console.log("Target: 0xc2caa2a6\n");

  for (const err of errors) {
    const selector = ethers.id(err).substring(0, 10);
    const match = selector === "0xc2caa2a6" ? " <<< MATCH" : "";
    console.log(`  ${selector} → ${err}${match}`);
  }

  // Also check if there are new deposits somewhere
  console.log("\n\n=== Checking Vault deposit state ===\n");
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const [deployer] = await ethers.getSigners();
  
  const vaultAbi = [
    "function totalDeposited() view returns (uint256)",
    "function totalRewardsPaid() view returns (uint256)",
    "function totalWithdrawn() view returns (uint256)",
    "function depositCount() view returns (uint256)",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  try {
    const totalDep = await vault.totalDeposited();
    console.log("totalDeposited:", ethers.formatEther(totalDep));
  } catch (e: any) { console.log("totalDeposited: ERROR -", e.reason || e.message); }
  
  try {
    const totalPaid = await vault.totalRewardsPaid();
    console.log("totalRewardsPaid:", ethers.formatEther(totalPaid));
  } catch (e: any) { console.log("totalRewardsPaid: ERROR -", e.reason || e.message); }
  
  try {
    const totalWith = await vault.totalWithdrawn();
    console.log("totalWithdrawn:", ethers.formatEther(totalWith));
  } catch (e: any) { console.log("totalWithdrawn: ERROR -", e.reason || e.message); }
}

main().catch(console.error);
