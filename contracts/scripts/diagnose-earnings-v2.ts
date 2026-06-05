import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";

const VAULT_ABI = [
  "function getPendingRewards(address user) external view returns (uint256 pendingUSDT)",
  "function getActiveDeposit(address user) external view returns (uint256)",
  "function getUserTier(address user) external view returns (uint256)",
  "function getCombinedEarnings(address user) external view returns (uint256)",
  "function getUserPool(address user) external view returns (tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))",
  "function totalDeposited() external view returns (uint256)",
  "function launchTimestamp() external view returns (uint256)",
  "event Deposited(address indexed user, uint256 amount, uint256 newTotal, uint256 tier)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Yield Diagnostic V2 ===");
  console.log("Deployer:", deployer.address);
  console.log("Current time:", new Date().toISOString());

  const vault = new ethers.Contract(VAULT, VAULT_ABI, deployer);

  // ─── Check launch timestamp ────────────────────────────────
  const launch = await vault.launchTimestamp();
  const launchDate = new Date(Number(launch) * 1000);
  const daysSinceLaunch = Math.floor((Date.now() / 1000 - Number(launch)) / 86400);
  console.log("\nLaunch: %s (%d days ago)", launchDate.toISOString(), daysSinceLaunch);

  // ─── Deployer state ────────────────────────────────────────
  console.log("\n─── Deployer State ───");
  const pool = await vault.getUserPool(deployer.address);
  console.log("  totalBalance:    %s USDT", ethers.formatEther(pool[0]));
  console.log("  lastClaimTime:   %s (%s)", pool[1].toString(), new Date(Number(pool[1]) * 1000).toISOString());
  console.log("  accruedRewards:  %s USDT", ethers.formatEther(pool[2]));
  console.log("  totalClaimed:    %s USDT", ethers.formatEther(pool[3]));
  console.log("  maxReturn:       %s USDT", ethers.formatEther(pool[4]));
  console.log("  lastDepositTime: %s (%s)", pool[6].toString(), new Date(Number(pool[6]) * 1000).toISOString());
  console.log("  active:          %s", pool[7]);

  const pending = await vault.getPendingRewards(deployer.address);
  console.log("  pendingRewards:  %s USDT", ethers.formatEther(pending));

  const active = await vault.getActiveDeposit(deployer.address);
  console.log("  activeDeposit:   %s USDT", ethers.formatEther(active));

  // ─── Total deposited ───────────────────────────────────────
  const totalDep = await vault.totalDeposited();
  console.log("\n  Vault totalDeposited: %s USDT", ethers.formatEther(totalDep));

  if (pool[0] > 0n) {
    // Deployer has a deposit - calculate expected yield
    console.log("\n─── Yield Analysis for Deployer ───");
    const elapsed = BigInt(Math.floor(Date.now() / 1000)) - pool[1];
    console.log("  Elapsed since lastClaim: %d seconds (%d hours)", elapsed.toString(), Number(elapsed) / 3600);
    console.log("  Daily rate depends on 7-day rotational schedule + balance tier");
    console.log("  If elapsed < 1 day, yield will be small for small deposits");
  }

  // ─── Find sample depositors from events ────────────────────
  console.log("\n─── Sample Depositor Check ───");
  
  // Use BSCscan-like approach: query past Deposited events
  const filter = vault.filters.Deposited();
  const events = await vault.queryFilter(filter, -10000); // last 10k blocks
  console.log("  Found %d Deposit events in recent blocks", events.length);

  // Check first 3 unique depositors
  const seen = new Set<string>();
  let checked = 0;
  for (const ev of events.slice(-50).reverse()) {
    const user = (ev as any).args[0];
    if (seen.has(user) || checked >= 3) continue;
    seen.add(user);
    checked++;

    console.log("\n  Depositor #%d: %s", checked, user);
    try {
      const dp = await vault.getUserPool(user);
      console.log("    totalBalance:   %s USDT", ethers.formatEther(dp[0]));
      console.log("    lastClaimTime:  %s ago (%s)", 
        Math.floor(Date.now()/1000 - Number(dp[1])),
        new Date(Number(dp[1]) * 1000).toISOString());
      console.log("    accruedRewards: %s USDT", ethers.formatEther(dp[2]));
      const p = await vault.getPendingRewards(user);
      console.log("    pendingRewards: %s USDT", ethers.formatEther(p));
      console.log("    active:         %s", dp[7]);
    } catch (e: any) {
      console.log("    ERROR:", e.message?.slice(0, 80));
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
