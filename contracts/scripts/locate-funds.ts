import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const OLD_IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Locate USDT Funds ===\n");

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const usdt = new ethers.Contract(USDT, erc20, deployer);

  // Check USDT in various contracts
  const vaultBal = await usdt.balanceOf(VAULT);
  const ieBal = await usdt.balanceOf(OLD_IE);
  const deployerBal = await usdt.balanceOf(deployer.address);

  console.log("USDT Balances:");
  console.log("  Vault (0x988b):   ", ethers.formatEther(vaultBal));
  console.log("  Old IE (0xe062):  ", ethers.formatEther(ieBal));
  console.log("  Deployer:         ", ethers.formatEther(deployerBal));

  // Check if old IE has user data
  console.log("\n--- Old IE User Data ---");
  const ieAbi = [
    "function getUserDeposits(address) view returns (tuple(uint256 amount, uint256 startTime, uint256 lastClaimTime, uint256 totalClaimed, uint256 maxReturn, bool active)[])",
    "function totalInvestments() view returns (uint256)",
    "function getActiveDepositCount(address) view returns (uint256)",
  ];
  const ie = new ethers.Contract(OLD_IE, ieAbi, deployer);

  try {
    const totalInv = await ie.totalInvestments();
    console.log("Old IE totalInvestments:", ethers.formatEther(totalInv));
  } catch (e: any) {
    console.log("Old IE totalInvestments: ERROR -", e.message?.slice(0, 60));
  }

  // Check user 0x1d88... in old IE
  const largeUser = ethers.getAddress("0x1d8896b5b5408fa0640cf942c17dded0c0992658");
  try {
    const deposits = await ie.getUserDeposits(largeUser);
    console.log(`\nOld IE deposits for ${largeUser}: ${deposits.length} deposits`);
    let total = 0n;
    for (let i = 0; i < deposits.length; i++) {
      const d = deposits[i];
      console.log(`  [${i}] amount: ${ethers.formatEther(d.amount)}, active: ${d.active}`);
      if (d.active) total += d.amount;
    }
    console.log(`  Total active: ${ethers.formatEther(total)}`);
  } catch (e: any) {
    console.log(`Old IE getUserDeposits: ERROR - ${e.message?.slice(0, 100)}`);
  }

  try {
    const count = await ie.getActiveDepositCount(largeUser);
    console.log(`Old IE activeDepositCount for large user: ${count}`);
  } catch (e: any) {
    console.log(`Old IE getActiveDepositCount: ERROR - ${e.message?.slice(0, 60)}`);
  }
}

main().catch(console.error);
