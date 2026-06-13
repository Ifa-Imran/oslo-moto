import { ethers } from "hardhat";

// Mainnet V3 addresses
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

// Test user address
const TEST_USER = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Early Exit Timer Diagnosis ===\n");
  console.log("Test User: %s\n", TEST_USER);

  const vaultAbi = [
    "function userPools(address) view returns (tuple(uint256 totalBalance, uint256 lastClaimTime, uint256 accruedRewards, uint256 totalClaimed, uint256 maxReturn, uint256 totalCombinedEarnings, uint256 lastDepositTime, bool active))",
    "function isInEarlyExitPeriod(address) view returns (bool)",
    "function deposit(uint256 amount)",
  ];

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address, uint256) returns (bool)",
  ];

  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);
  const usdt = new ethers.Contract(USDT, erc20Abi, deployer);

  // ─── 1. Check Current Pool State ───
  console.log("═══════════════════════════════════════════════");
  console.log("1. CURRENT POOL STATE");
  console.log("═══════════════════════════════════════════════");

  const pool = await vault.userPools(TEST_USER);
  console.log("Total Balance: %s USDT", ethers.formatEther(pool.totalBalance));
  console.log("Last Deposit Time: %s", new Date(Number(pool.lastDepositTime) * 1000).toISOString());
  console.log("Active: %s", pool.active);
  console.log("Total Claimed: %s USDT", ethers.formatEther(pool.totalClaimed));

  const inEarlyExit = await vault.isInEarlyExitPeriod(TEST_USER);
  console.log("\nIn Early Exit Period: %s", inEarlyExit);

  if (inEarlyExit) {
    const now = Math.floor(Date.now() / 1000);
    const deadline = Number(pool.lastDepositTime) + (10 * 24 * 60 * 60); // 10 days
    const remaining = deadline - now;
    
    console.log("\nEarly Exit Deadline: %s", new Date(deadline * 1000).toISOString());
    console.log("Time Remaining: %s", remaining > 0 ? `${Math.floor(remaining / 86400)} days ${Math.floor((remaining % 86400) / 3600)} hours` : "EXPIRED");
  }

  // ─── 2. Check Deposit History ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("2. EARLY EXIT TIMER LOGIC");
  console.log("═══════════════════════════════════════════════");

  console.log("\nCurrent Logic (BEFORE FIX):");
  console.log("  ❌ lastDepositTime is updated on EVERY deposit");
  console.log("  ❌ Each new deposit resets the 10-day timer");
  console.log("  ❌ User sees early exit timer even after making additional deposits");

  console.log("\nFixed Logic (AFTER FIX):");
  console.log("  ✅ lastDepositTime is set ONLY on FIRST deposit (when totalBalance == 0)");
  console.log("  ✅ Subsequent deposits do NOT reset the timer");
  console.log("  ✅ After initial 10 days expire, early exit is permanently disabled");

  // ─── 3. Simulation ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("3. SCENARIO SIMULATION");
  console.log("═══════════════════════════════════════════════");

  console.log("\nScenario: User makes multiple deposits");
  console.log("  Day 0:  First deposit $100  → Timer starts (10 days)");
  console.log("  Day 3:  Second deposit $200 → OLD: Timer resets ❌ | NEW: Timer unchanged ✅");
  console.log("  Day 7:  Third deposit $150  → OLD: Timer resets ❌ | NEW: Timer unchanged ✅");
  console.log("  Day 11: Early exit window   → OLD: Still active ❌ | NEW: Expired ✅");

  console.log("\nExpected Behavior After Fix:");
  console.log("  - Day 0-10: Early exit available (10% penalty)");
  console.log("  - Day 11+: Early exit PERMANENTLY disabled");
  console.log("  - Future deposits: Do NOT re-enable early exit");

  // ─── 4. Contract Code Review ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("4. CODE CHANGE SUMMARY");
  console.log("═══════════════════════════════════════════════");

  console.log("\nFile: contracts/OSLOVault.sol");
  console.log("Function: deposit()");
  console.log("\nBEFORE (Line 221):");
  console.log("  pool.lastDepositTime = block.timestamp;  // ❌ Updates on EVERY deposit");
  
  console.log("\nAFTER (Lines 217-226):");
  console.log("  bool isFirstDeposit = (pool.totalBalance == 0);");
  console.log("  pool.totalBalance += amount;");
  console.log("  ...");
  console.log("  if (isFirstDeposit) {");
  console.log("      pool.lastDepositTime = block.timestamp;  // ✅ Only on FIRST deposit");
  console.log("  }");

  // ─── 5. Verification Steps ───
  console.log("\n═══════════════════════════════════════════════");
  console.log("5. VERIFICATION STEPS");
  console.log("═══════════════════════════════════════════════");

  console.log("\nAfter deploying the fix:");
  console.log("  1. Create new test account");
  console.log("  2. Make first deposit → Check isInEarlyExitPeriod() = true");
  console.log("  3. Wait 1 day → Make second deposit");
  console.log("  4. Verify lastDepositTime UNCHANGED");
  console.log("  5. Fast forward 9 more days (total 10)");
  console.log("  6. Verify isInEarlyExitPeriod() = false");
  console.log("  7. Make third deposit → Timer should NOT reset");
  console.log("  8. Verify early exit permanently disabled");

  console.log("\n=== Diagnosis Complete ===\n");
}

main().catch(console.error);
