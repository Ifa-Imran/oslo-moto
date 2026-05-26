import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Snapshot Testnet Referral Tree
 * 
 * Reads all registered users from the current testnet OSLOReferral contract
 * and outputs a JSON file with the referral tree ordered parents-before-children.
 * 
 * Run:
 *   npx hardhat run scripts/snapshot-testnet.ts --network bscTestnet
 */

const REFERRAL_ADDRESS = "0x5148ed04B40FFECb6832a51F31aE1f9f8bc97a27";
const INVESTMENT_ENGINE_ADDRESS = "0xD4AFd86e0eB9694c72E8693886a3Db29bF390d64";

async function main() {
  console.log("=== OSLO Testnet Referral Snapshot ===\n");

  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);

  // Read total registered count
  const totalRegistered = await referral.totalRegistered();
  console.log(`Total registered users: ${totalRegistered}`);

  if (totalRegistered === 0n) {
    console.log("No users registered. Exiting.");
    return;
  }

  // Known root wallets to start BFS from
  const KNOWN_ROOTS = [
    "0x47f8160e3C854b4b4679579b99726E5E81736B7f", // deployer
    "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // second root user
  ];

  console.log("\nWalking referral tree from known root wallets...");

  interface UserData {
    address: string;
    referrer: string;
    unlockedLevels: number;
    directReferralCount: number;
  }

  const users: UserData[] = [];
  const visited = new Set<string>();
  const queue: string[] = [...KNOWN_ROOTS];

  // BFS through the tree: start with known roots, then walk all direct referrals
  while (queue.length > 0) {
    const addr = queue.shift()!;
    if (visited.has(addr.toLowerCase())) continue;

    // Check if registered
    try {
      const info = await referral.userInfo(addr);
      const isRegistered = info.registered;
      if (!isRegistered) {
        console.log(`  [SKIP] ${addr} — not registered`);
        continue;
      }

      visited.add(addr.toLowerCase());
      const referrerAddr = info.referrer;
      const unlockedLevels = Number(info.unlockedLevels);

      // Get direct referrals to continue BFS
      let directs: string[] = [];
      try {
        directs = await referral.getDirectReferrals(addr);
      } catch { /* may not exist */ }

      users.push({
        address: addr,
        referrer: referrerAddr,
        unlockedLevels,
        directReferralCount: directs.length,
      });

      console.log(
        `  [${users.length}] ${addr} -> referrer: ${referrerAddr === ethers.ZeroAddress ? "ROOT" : referrerAddr.slice(0, 10) + "..."} (L${unlockedLevels}, ${directs.length} directs)`
      );

      // Add children to queue
      for (const child of directs) {
        if (!visited.has(child.toLowerCase())) {
          queue.push(child);
        }
      }
    } catch (err: any) {
      console.error(`  Error reading ${addr}: ${err.message}`);
    }
  }

  console.log(`\nFound ${users.length} registered users via tree walk`);

  // ─── Read Active Stakes ─────────────────────────────────────────
  console.log("\n--- Reading Active Stakes from InvestmentEngine ---");
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE_ADDRESS);

  interface DepositData {
    owner: string;
    index: number;
    amount: string;
    tier: number;
    dailyRate: number;
    depositTime: number;
    lastClaimTime: number;
    totalClaimed: string;
    maxReturn: string;
    active: boolean;
  }

  const allDeposits: DepositData[] = [];

  for (const user of users) {
    try {
      const depositCount = await investmentEngine.getDepositCount(user.address);
      const count = Number(depositCount);
      if (count === 0) continue;

      console.log(`  ${user.address}: ${count} deposit(s)`);

      for (let i = 0; i < count; i++) {
        const dep = await investmentEngine.userDeposits(user.address, i);
        const deposit: DepositData = {
          owner: user.address,
          index: i,
          amount: ethers.formatEther(dep.amount),
          tier: Number(dep.tier),
          dailyRate: Number(dep.dailyRate),
          depositTime: Number(dep.depositTime),
          lastClaimTime: Number(dep.lastClaimTime),
          totalClaimed: ethers.formatEther(dep.totalClaimed),
          maxReturn: ethers.formatEther(dep.maxReturn),
          active: dep.active,
        };
        allDeposits.push(deposit);
        console.log(
          `    [${i}] $${deposit.amount} USDT | Tier ${deposit.tier} | Rate ${deposit.dailyRate}bp | Active: ${deposit.active} | Claimed: $${deposit.totalClaimed}`
        );
      }

      // Also read combined earnings
      const userInfo = await investmentEngine.users(user.address);
      console.log(
        `    Total Active: $${ethers.formatEther(userInfo.totalActiveDeposit)} | Combined Earnings: $${ethers.formatEther(userInfo.totalCombinedEarnings)}`
      );
    } catch (err: any) {
      console.error(`  Error reading deposits for ${user.address}: ${err.message}`);
    }
  }

  console.log(`\nTotal deposits found: ${allDeposits.length}`);
  console.log(`Active deposits: ${allDeposits.filter(d => d.active).length}`);

  // Sort: parents before children (topological sort)
  // Root users (referrer = 0x0) come first, then their children, etc.
  const sorted: UserData[] = [];
  const added = new Set<string>();

  // First pass: add root users
  for (const user of users) {
    if (user.referrer === ethers.ZeroAddress) {
      sorted.push(user);
      added.add(user.address.toLowerCase());
    }
  }

  // Iterative passes: add users whose referrer is already in sorted
  let changed = true;
  while (changed) {
    changed = false;
    for (const user of users) {
      if (added.has(user.address.toLowerCase())) continue;
      if (added.has(user.referrer.toLowerCase())) {
        sorted.push(user);
        added.add(user.address.toLowerCase());
        changed = true;
      }
    }
  }

  // Add any remaining (shouldn't happen in a valid tree)
  for (const user of users) {
    if (!added.has(user.address.toLowerCase())) {
      sorted.push(user);
      added.add(user.address.toLowerCase());
    }
  }

  // Output snapshot
  const snapshot = {
    network: "bscTestnet",
    chainId: 97,
    referralContract: REFERRAL_ADDRESS,
    investmentEngineContract: INVESTMENT_ENGINE_ADDRESS,
    snapshotTime: new Date().toISOString(),
    totalRegistered: Number(totalRegistered),
    users: sorted.map((u) => ({
      address: u.address,
      referrer: u.referrer,
      unlockedLevels: u.unlockedLevels,
    })),
    deposits: allDeposits,
  };

  const outputPath = path.join(__dirname, "..", "data", "testnet-snapshot.json");
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

  console.log(`\n=== Snapshot Complete ===`);
  console.log(`Total users: ${sorted.length}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
