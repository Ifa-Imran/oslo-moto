import { ethers } from "hardhat";

/**
 * Seed large deposits via migrateDeposits() — bypasses MAX_DEPOSIT_PER_TX limit.
 * 
 * Wallets:
 *   0xA14d5648F27fD6828AADa69Ac41e9715A6D21DC9 → $1,064,999
 *   0x326F80A708fE8E6d31Cd7C7219979e8b5079b419 → $845,000
 */

const IE_ADDRESS = "0xe44eb2Dd7129571AC514E646302e829B8738528d";

const DEPOSITS = [
  {
    owner: "0xA14d5648F27fD6828AADa69Ac41e9715A6D21DC9",
    amount: ethers.parseEther("1064999"),  // $1,064,999
    tier: 5,
    dailyRate: 350, // 3.50% — Tier 5
  },
  {
    owner: "0x326F80A708fE8E6d31Cd7C7219979e8b5079b419",
    amount: ethers.parseEther("845000"),   // $845,000
    tier: 5,
    dailyRate: 350, // 3.50% — Tier 5
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDRESS);

  const now = Math.floor(Date.now() / 1000);

  const migrations = DEPOSITS.map((d) => ({
    owner: d.owner,
    amount: d.amount,
    tier: d.tier,
    dailyRate: d.dailyRate,
    depositTime: now,
    lastClaimTime: now,
    totalClaimed: 0,
    maxReturn: d.amount * 3n, // 3X cap
  }));

  console.log("\n--- Seeding Large Deposits ---");
  for (const m of migrations) {
    console.log(`  ${m.owner}: $${ethers.formatEther(m.amount)} (Tier ${m.tier})`);
  }

  const tx = await ie.migrateDeposits(migrations);
  console.log(`\nTX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`TX confirmed in block ${receipt!.blockNumber}`);

  // Verify
  console.log("\n--- Verification ---");
  for (const d of DEPOSITS) {
    const user = await ie.users(d.owner);
    const count = await ie.getDepositCount(d.owner);
    console.log(`  ${d.owner}:`);
    console.log(`    depositCount = ${count}`);
    console.log(`    totalActiveDeposit = $${ethers.formatEther(user.totalActiveDeposit)}`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
