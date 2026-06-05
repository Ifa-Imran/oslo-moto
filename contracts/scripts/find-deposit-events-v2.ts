import { ethers } from "hardhat";

async function main() {
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";

  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const depositFilter = vault.filters.Deposited();
  
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  
  // Try small chunks
  const chunkSize = 1000;
  let totalFound = 0;
  
  for (let start = currentBlock - 3000; start < currentBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, currentBlock);
    try {
      const events = await vault.queryFilter(depositFilter, start, end);
      if (events.length > 0) {
        console.log(`Block ${start}-${end}: ${events.length} events`);
        for (const ev of events) {
          if ('args' in ev) {
            console.log(`  User: ${ev.args.user}, Amount: ${ethers.formatUnits(ev.args.amount, 18)}, NewTotal: ${ethers.formatUnits(ev.args.newTotal, 18)}`);
            totalFound++;
          }
        }
      }
    } catch (e: any) {
      console.log(`Block ${start}-${end}: Error - ${e.message?.substring(0, 80)}`);
    }
  }
  
  console.log(`\nTotal deposit events found in last 3000 blocks: ${totalFound}`);
  
  // Also try BSCScan approach - look for transactions to Vault
  console.log("\n=== Checking Vault creation block via BSCScan ===");
  // We know totalDeposited = 2.97M. Let's check a known user
  // The screenshot showed 0x8F...6Df8
  const testUsers = [
    "0x8Fd3C78Fb396E7CaD1e5F296eFCBe22c8BeC6Df8",
    "0x47f8160e3C854b4b4679579b99726E5E81736B7f"  // deployer
  ];
  
  console.log("\n=== Checking specific user pools ===");
  for (const user of testUsers) {
    try {
      const pool = await vault.getUserPool(user);
      console.log(`\n${user}:`);
      console.log(`  totalBalance: ${ethers.formatUnits(pool[0], 18)}`);
      console.log(`  lastClaimTime: ${pool[1].toString()}`);
      console.log(`  accruedRewards: ${ethers.formatUnits(pool[2], 18)}`);
      console.log(`  totalClaimed: ${ethers.formatUnits(pool[3], 18)}`);
      console.log(`  maxReturn: ${ethers.formatUnits(pool[4], 18)}`);
      console.log(`  totalCombinedEarnings: ${ethers.formatUnits(pool[5], 18)}`);
      console.log(`  lastDepositTime: ${pool[6].toString()}`);
      console.log(`  active: ${pool[7]}`);
    } catch (e: any) {
      console.log(`${user}: Error - ${e.message?.substring(0, 100)}`);
    }
  }
}

main().catch(console.error);
