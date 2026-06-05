import { ethers } from "hardhat";

async function main() {
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const OLD_IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";

  // Check Vault Deposited events
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const depositFilter = vault.filters.Deposited();
  
  console.log("=== Vault Deposited Events (last 5000 blocks) ===");
  const currentBlock = await ethers.provider.getBlockNumber();
  try {
    const events = await vault.queryFilter(depositFilter, currentBlock - 5000, currentBlock);
    console.log(`Found ${events.length} Deposit events`);
    for (const ev of events) {
      if ('args' in ev) {
        const args = ev.args;
        console.log(`  User: ${args.user}, Amount: ${ethers.formatUnits(args.amount, 18)}, NewTotal: ${ethers.formatUnits(args.newTotal, 18)}, Tier: ${args.tier}`);
      }
    }
  } catch (e: any) {
    console.log("Error querying vault events:", e.message?.substring(0, 100));
  }

  // Try larger range
  console.log("\n=== Vault Deposited Events (last 50000 blocks) ===");
  try {
    const events = await vault.queryFilter(depositFilter, currentBlock - 50000, currentBlock);
    console.log(`Found ${events.length} Deposit events`);
    for (const ev of events.slice(0, 20)) {
      if ('args' in ev) {
        const args = ev.args;
        console.log(`  User: ${args.user}, Amount: ${ethers.formatUnits(args.amount, 18)}, NewTotal: ${ethers.formatUnits(args.newTotal, 18)}`);
      }
    }
    if (events.length > 20) console.log(`  ... and ${events.length - 20} more`);
  } catch (e: any) {
    console.log("Error:", e.message?.substring(0, 200));
  }

  // Also check old IE for deposit events
  console.log("\n=== Old IE - Checking via generic event scan ===");
  const ieAbi = [
    "event Deposited(address indexed user, uint256 amount, uint256 poolId, uint256 tier)",
    "function getUserPool(address user) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)"
  ];
  const oldIE = new ethers.Contract(OLD_IE, ieAbi, ethers.provider);
  try {
    const ieFilter = oldIE.filters.Deposited();
    const ieEvents = await oldIE.queryFilter(ieFilter, currentBlock - 50000, currentBlock);
    console.log(`Found ${ieEvents.length} Deposit events on old IE`);
    for (const ev of ieEvents.slice(0, 20)) {
      if ('args' in ev) {
        const args = ev.args;
        console.log(`  User: ${args[0]}, Amount: ${ethers.formatUnits(args[1], 18)}`);
      }
    }
  } catch (e: any) {
    console.log("Error:", e.message?.substring(0, 200));
  }
}

main().catch(console.error);
