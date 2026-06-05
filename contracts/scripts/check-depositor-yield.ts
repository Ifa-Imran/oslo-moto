import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";

const VAULT_ABI = [
  "function getPendingRewards(address user) external view returns (uint256 pendingUSDT)",
  "function getUserPool(address user) external view returns (tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))",
  "event Deposited(address indexed user, uint256 amount, uint256 newTotal, uint256 tier)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const vault = new ethers.Contract(VAULT, VAULT_ABI, deployer);

  // Get current block
  const blockNum = await ethers.provider.getBlockNumber();
  console.log("Current block:", blockNum);

  // Query last 1000 blocks
  const fromBlock = blockNum - 10;
  console.log("Querying blocks %d → %d", fromBlock, blockNum);
  
  const filter = vault.filters.Deposited();
  const events = await vault.queryFilter(filter, fromBlock, blockNum);
  console.log("Found %d Deposit events", events.length);

  const seen = new Set<string>();
  let checked = 0;
  for (const ev of events.reverse()) {
    const user = (ev as any).args[0];
    if (seen.has(user) || checked >= 3) continue;
    seen.add(user);
    checked++;

    console.log("\nDepositor #%d: %s", checked, user);
    const dp = await vault.getUserPool(user);
    console.log("  totalBalance:   %s USDT", ethers.formatEther(dp[0]));
    console.log("  lastClaimTime:  %s ago", Math.floor(Date.now()/1000 - Number(dp[1])));
    console.log("  accruedRewards: %s USDT", ethers.formatEther(dp[2]));
    const p = await vault.getPendingRewards(user);
    console.log("  pendingRewards: %s USDT", ethers.formatEther(p));
    console.log("  active:         %s", dp[7]);
  }

  console.log("\nDone.");
}

main().catch(console.error);
