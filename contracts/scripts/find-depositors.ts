import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Find Active Depositors ===\n");

  const vaultAbi = [
    "function totalDeposited() view returns (uint256)",
    "function getUserPool(address) view returns (uint256 totalBalance, uint256 lastClaimTime, uint256 accruedRewards, uint256 totalClaimed, uint256 maxReturn, uint256 totalCombinedEarnings, uint256 lastDepositTime, bool active)",
    "function getPendingRewards(address) view returns (uint256)",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const usdt = new ethers.Contract(USDT, erc20, deployer);

  // Check USDT balance of Vault (represents actual deposits held)
  const vaultUsdt = await usdt.balanceOf(VAULT);
  console.log("Vault USDT balance:", ethers.formatEther(vaultUsdt));
  console.log("Vault totalDeposited:", ethers.formatEther(await vault.totalDeposited()));

  // Check the user from the screenshot: 0x8F...6Df8
  // We need to find their full address. Let me check some possible addresses
  const testAddresses = [
    ethers.getAddress("0x1d8896b5b5408fa0640cf942c17dded0c0992658"),
    deployer.address,
  ];

  console.log("\n--- User Pool Checks (correct struct order) ---");
  for (const addr of testAddresses) {
    const pool = await vault.getUserPool(addr);
    if (pool.totalBalance > 0n) {
      console.log(`\n  User: ${addr}`);
      console.log(`  totalBalance: ${ethers.formatEther(pool.totalBalance)}`);
      console.log(`  lastClaimTime: ${pool.lastClaimTime}`);
      console.log(`  accruedRewards: ${ethers.formatEther(pool.accruedRewards)}`);
      console.log(`  totalClaimed: ${ethers.formatEther(pool.totalClaimed)}`);
      console.log(`  maxReturn: ${ethers.formatEther(pool.maxReturn)}`);
      console.log(`  lastDepositTime: ${pool.lastDepositTime}`);
      console.log(`  active: ${pool.active}`);
      const pending = await vault.getPendingRewards(addr);
      console.log(`  pendingRewards: ${ethers.formatEther(pending)}`);
    } else {
      console.log(`\n  User: ${addr} → NO DEPOSITS (totalBalance = 0)`);
    }
  }

  // Try to find who actually deposited by checking recent deposit events
  // Use a small block range to avoid rate limiting
  console.log("\n--- Attempting to find depositors via events ---");
  const vaultEvents = new ethers.Contract(VAULT, [
    "event Deposited(address indexed user, uint256 amount, uint256 newTotal)"
  ], deployer);
  
  try {
    const currentBlock = await deployer.provider.getBlockNumber();
    // Try last 5 blocks only (to avoid rate limit)
    const events = await vaultEvents.queryFilter(
      vaultEvents.filters.Deposited(),
      currentBlock - 5,
      currentBlock
    );
    console.log(`Found ${events.length} deposit events in last 5 blocks`);
    for (const ev of events) {
      console.log(`  Depositor: ${(ev as any).args.user}, Amount: ${ethers.formatEther((ev as any).args.amount)}`);
    }
  } catch (e: any) {
    console.log("Event query failed (RPC limit):", e.message?.slice(0, 80));
  }

  // Let's also try to use getActiveDeposit for users
  console.log("\n--- Check via getActiveDeposit ---");
  const vault2 = new ethers.Contract(VAULT, [
    "function getActiveDeposit(address) view returns (uint256)",
  ], deployer);
  
  for (const addr of testAddresses) {
    const active = await vault2.getActiveDeposit(addr);
    console.log(`  ${addr}: activeDeposit = ${ethers.formatEther(active)}`);
  }
}

main().catch(console.error);
