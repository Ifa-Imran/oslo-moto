import { ethers } from "hardhat";

/**
 * Batch Scan: Find ALL wallets affected by the totalEarnings dual-use flaw.
 *
 * Uses ReferralRegistry's getDirectDownlines to traverse the entire referral
 * tree from the root deployer, collecting all registered wallet addresses.
 * Then checks each for the claim-blocking condition.
 *
 * Usage: npx hardhat run scripts/debug/scan-all-wallets.ts --network bscMainnet
 */

const ENGINE_ADDR = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80"; // InvestmentEngineV2.1
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
];

const REGISTRY_ABI = [
  "function directReferrer(address) view returns (address)",
  "function getDirectDownlines(address) view returns (address[])",
  "function getDirectDownlineCount(address) view returns (uint256)",
  "function isRegistered(address) view returns (bool)",
];

type Issue = "SEEDED_CAP" | "EXTERNAL_INFLATION" | "INACTIVE" | "NO_ACCRUAL" | "NONE";

interface WalletReport {
  address: string;
  accrued: bigint;
  claimable: bigint;
  totalClaimed: bigint;
  seededEarnings: bigint;
  activeStake: bigint;
  stakeCount: number;
  activeStakeCount: number;
  issues: Issue[];
  maxTotalEarnings: bigint;
}

async function main() {
  const provider = ethers.provider;
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);

  console.log("=".repeat(70));
  console.log("BATCH SCAN: Find ALL wallets affected by totalEarnings flaw");
  console.log("=".repeat(70));
  console.log(`Engine:   ${ENGINE_ADDR}`);
  console.log(`Time:     ${new Date().toISOString()}`);

  // ---- 1. Protocol stats ----
  const [totalActiveStakes, totalUsers, totalTurnover] = await Promise.all([
    engine.totalActiveStakes(),
    engine.totalUsers(),
    engine.totalProtocolTurnover(),
  ]);

  console.log("\n--- PROTOCOL STATS ---");
  console.log(`  Total Users:             ${totalUsers}`);
  console.log(`  Total Active Stakes:     ${ethers.formatUnits(totalActiveStakes, 18)} USDT`);
  console.log(`  Total Protocol Turnover: ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // ---- 2. Traverse referral tree to collect all users ----
  console.log("\n--- TRAVERSING REFERRAL TREE ---");

  // Find root users (registered with address(1) as referrer = no referrer)
  // We need to start from known root addresses. The deployer is likely a root.
  // Let's try the deployer address and also scan for users with no referrer.
  const allUsers = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  // Known root addresses to start traversal
  const knownRoots = [
    "0xb259fcC202b17C124201C872c52f108ade380B4F", // Deployer
    "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // Reward wallet
    "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56", // Company wallet
    "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4", // Performance wallet
  ];

  // Also try finding roots by checking if they have downlines but no referrer
  for (const root of knownRoots) {
    const isReg = await registry.isRegistered(root);
    if (isReg) {
      queue.push(root);
    }
  }

  console.log(`  Starting roots: ${queue.length}`);

  // BFS traversal of the referral tree
  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    try {
      const downlines = await registry.getDirectDownlines(current);
      for (const d of downlines) {
        allUsers.add(d);
        if (!visited.has(d)) {
          queue.push(d);
        }
      }
    } catch {
      // Skip on error
    }
  }

  // Also add the roots themselves
  for (const root of knownRoots) {
    if (await registry.isRegistered(root).catch(() => false)) {
      allUsers.add(root);
    }
  }

  console.log(`  Found ${allUsers.size} unique registered wallets via referral tree`);

  // ---- 3. Also try event scanning as fallback ----
  if (allUsers.size < Number(totalUsers)) {
    console.log(`  (Referral tree found ${allUsers.size}/${totalUsers} users, trying event scan...)`);

    try {
      const stakedFilter = engine.filters.Staked?.();
      if (stakedFilter) {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 28800 * 60); // 60 days
        const CHUNK = 2000;

        for (let start = fromBlock; start < currentBlock; start += CHUNK) {
          const end = Math.min(start + CHUNK - 1, currentBlock);
          try {
            const events = await engine.queryFilter(stakedFilter, start, end);
            for (const e of events) {
              const args = (e as unknown as { args?: unknown[] }).args;
              if (args && args[0]) allUsers.add(args[0] as string);
            }
          } catch {
            // Skip chunk
          }
        }
        console.log(`  After event scan: ${allUsers.size} unique wallets`);
      }
    } catch {
      // Event filter not available, continue with what we have
    }
  }

  // ---- 4. Check each user ----
  console.log(`\n--- CHECKING ${allUsers.size} WALLETS ---`);

  const affected: WalletReport[] = [];
  const healthy: WalletReport[] = [];
  let checked = 0;

  for (const user of allUsers) {
    checked++;
    if (checked % 20 === 0) {
      console.log(`  Progress: ${checked}/${allUsers.size} checked...`);
    }

    try {
      const hasStaked = await engine.hasStaked(user);
      if (!hasStaked) continue;

      const [stakes, accrued, claimable, totalClaimed, seeded, activeStakeTotal] = await Promise.all([
        engine.getUserStakes(user),
        engine.calculateAccruedYield(user),
        engine.getClaimableYield(user),
        engine.totalClaimed(user),
        engine.seededEarnings(user),
        engine.getTotalActiveStake(user),
      ]);

      // Skip if no stakes
      if (stakes.length === 0) continue;

      // Classify issues
      const issues: Issue[] = [];
      let activeCount = 0;
      let maxTotalEarnings = 0n;

      for (const s of stakes) {
        if (s.isActive) activeCount++;
        if (s.totalEarnings > maxTotalEarnings) maxTotalEarnings = s.totalEarnings;

        if (s.isActive && s.totalEarnings > 0n) {
          // External inflation: totalEarnings includes level commissions
          if (s.totalEarnings > accrued) {
            if (!issues.includes("EXTERNAL_INFLATION")) issues.push("EXTERNAL_INFLATION");
          }
        }

        if (s.isActive) {
          const cap = s.activeStake * 3n;
          const effective = s.totalEarnings + seeded;
          if (effective >= cap && seeded > 0n) {
            if (!issues.includes("SEEDED_CAP")) issues.push("SEEDED_CAP");
          }
        }
      }

      if (activeCount === 0 && stakes.length > 0) {
        issues.push("INACTIVE");
      }

      if (accrued === 0n && claimable === 0n && activeCount > 0) {
        issues.push("NO_ACCRUAL");
      }

      if (claimable === 0n && accrued > 0n && issues.length === 0) {
        issues.push("EXTERNAL_INFLATION");
      }

      const report: WalletReport = {
        address: user,
        accrued,
        claimable,
        totalClaimed,
        seededEarnings: seeded,
        activeStake: activeStakeTotal,
        stakeCount: stakes.length,
        activeStakeCount: activeCount,
        issues: issues.length > 0 ? issues : ["NONE"],
        maxTotalEarnings,
      };

      if (claimable === 0n && accrued > 0n) {
        affected.push(report);
      } else {
        healthy.push(report);
      }
    } catch (err) {
      // Skip on error
    }
  }

  // ---- 5. Report ----
  console.log("\n" + "=".repeat(70));
  console.log("SCAN RESULTS");
  console.log("=".repeat(70));
  console.log(`  Total wallets found:    ${allUsers.size}`);
  console.log(`  Wallets with stakes:    ${affected.length + healthy.length}`);
  console.log(`  Healthy wallets:        ${healthy.length}`);
  console.log(`  Affected wallets:       ${affected.length}`);
  console.log(`  Healthy + claimable:    ${healthy.filter(w => w.claimable > 0n).length}`);

  if (affected.length > 0) {
    console.log("\n" + "-".repeat(70));
    console.log("AFFECTED WALLETS (claimableYield=0 but accruedYield>0):");
    console.log("-".repeat(70));

    // Group by issue type
    const byIssue = new Map<string, WalletReport[]>();
    for (const w of affected) {
      for (const issue of w.issues) {
        if (!byIssue.has(issue)) byIssue.set(issue, []);
        byIssue.get(issue)!.push(w);
      }
    }

    console.log("\nBy root cause:");
    for (const [issue, wallets] of byIssue) {
      console.log(`  ${issue}: ${wallets.length} wallets`);
    }

    console.log("\n" + "-".repeat(160));
    console.log("Address                                        | Active Stake | Accrued       | Claimable | Seeded        | maxTotalEarn  | Issues");
    console.log("-".repeat(160));

    for (const w of affected) {
      const addr = `${w.address.slice(0, 8)}...${w.address.slice(-6)}`;
      const active = ethers.formatUnits(w.activeStake, 18).padStart(12);
      const accr = ethers.formatUnits(w.accrued, 18).padStart(13);
      const claim = ethers.formatUnits(w.claimable, 18).padStart(9);
      const seeded = ethers.formatUnits(w.seededEarnings, 18).padStart(13);
      const te = ethers.formatUnits(w.maxTotalEarnings, 18).padStart(13);
      const issues = w.issues.join(",");
      console.log(`${addr} | ${active} | ${accr} | ${claim} | ${seeded} | ${te} | ${issues}`);
    }

    // Summary
    let totalBlocked = 0n;
    for (const w of affected) totalBlocked += w.accrued;
    console.log(`\n  Total blocked yield: ${ethers.formatUnits(totalBlocked, 18)} USDT`);

    // Output addresses for batch fix
    console.log("\n" + "-".repeat(70));
    console.log("ADDRESSES FOR BATCH FIX:");
    console.log("-".repeat(70));
    console.log("const AFFECTED_WALLETS = [");
    for (const w of affected) {
      console.log(`  "${w.address}",`);
    }
    console.log("];");
  } else {
    console.log("\n  ✅ No affected wallets found!");
  }

  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
