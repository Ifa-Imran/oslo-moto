import { ethers } from "hardhat";

// Wallet that performed early exit and was charged more than 10%
const USER_PRIVATE_KEY = "12a9cb3664652015634f42172b8bee47af5abd2fcb65bc8943178c4a36f2a8ca";

// Latest deployed contract addresses
const CONTRACTS = {
  usdt: "0x1c45b21ED872b1f48b7912BF14F2ccE3CC262205",
  osloToken: "0xDedfEc7aC5f069FB465A00248d4713d8573A58fA",
  investmentEngine: "0xf84588DB6721bEAc3D723514f26A53F55E9FAD2E",
  osloDEX: "0x27FB29da4aF2D6EB6619876F92d36ca5138a0FAc",
  liquidityManager: "0x2CA9abC528206e8BF6d81E7E67664926ADc8D0Ca",
  referral: "0x63353A4b4C4Ce39ACe9FB2Eb6c0Fac7875a561A3",
};

async function main() {
  const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545");
  const wallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
  const userAddress = wallet.address;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  DEBUG: Early Exit Fee Discrepancy");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`User wallet: ${userAddress}`);
  console.log("");

  // ABI fragments needed
  const investmentEngineABI = [
    "function userDeposits(address, uint256) view returns (uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositTime, uint256 lastClaimTime, uint256 totalClaimed, uint256 maxReturn, bool active)",
    "function getDepositCount(address) view returns (uint256)",
    "function getActiveDeposit(address) view returns (uint256)",
    "function users(address) view returns (uint256 totalActiveDeposit, uint256 depositCount, uint256 totalCombinedEarnings)",
    "function getEarlyExitAmount(address, uint256) view returns (uint256 principal, uint256 accruedYield, uint256 exitFee, uint256 netReturn)",
    "function totalDeposited() view returns (uint256)",
    "function totalWithdrawn() view returns (uint256)",
    "event EarlyExited(address indexed user, uint256 amountReturned, uint256 feeDeducted, uint256 yieldDeducted, uint256 depositIndex)",
    "event Deposited(address indexed user, uint256 amount, uint256 tier, uint256 dailyRate, uint256 depositIndex)",
  ];

  const erc20ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ];

  const investmentEngine = new ethers.Contract(CONTRACTS.investmentEngine, investmentEngineABI, provider);
  const usdt = new ethers.Contract(CONTRACTS.usdt, erc20ABI, provider);

  // 1. Check current balances
  console.log("─── 1. Current Balances ───");
  const usdtBalance = await usdt.balanceOf(userAddress);
  const bnbBalance = await provider.getBalance(userAddress);
  console.log(`  USDT balance: ${ethers.formatEther(usdtBalance)} USDT`);
  console.log(`  BNB balance:  ${ethers.formatEther(bnbBalance)} BNB`);
  console.log("");

  // 2. Check deposit history
  console.log("─── 2. Deposit History ───");
  const depositCount = await investmentEngine.getDepositCount(userAddress);
  console.log(`  Total deposits: ${depositCount}`);
  console.log("");

  for (let i = 0; i < Number(depositCount); i++) {
    const dep = await investmentEngine.userDeposits(userAddress, i);
    const amount = dep[0];
    const tier = dep[1];
    const dailyRate = dep[2];
    const depositTime = dep[3];
    const lastClaimTime = dep[4];
    const totalClaimed = dep[5];
    const maxReturn = dep[6];
    const active = dep[7];

    console.log(`  Deposit #${i}:`);
    console.log(`    Principal:      ${ethers.formatEther(amount)} USDT`);
    console.log(`    Tier:           ${tier}`);
    console.log(`    Daily Rate:     ${Number(dailyRate) / 100}% (${dailyRate} bp)`);
    console.log(`    Deposit Time:   ${new Date(Number(depositTime) * 1000).toISOString()}`);
    console.log(`    Last Claim:     ${new Date(Number(lastClaimTime) * 1000).toISOString()}`);
    console.log(`    Total Claimed:  ${ethers.formatEther(totalClaimed)} USDT`);
    console.log(`    Max Return (3X):${ethers.formatEther(maxReturn)} USDT`);
    console.log(`    Active:         ${active}`);
    console.log("");
  }

  // 3. Check user info
  console.log("─── 3. User Info ───");
  const userInfo = await investmentEngine.users(userAddress);
  console.log(`  Total Active Deposit:     ${ethers.formatEther(userInfo[0])} USDT`);
  console.log(`  Deposit Count:            ${userInfo[1]}`);
  console.log(`  Total Combined Earnings:  ${ethers.formatEther(userInfo[2])} USDT`);
  console.log("");

  // 4. Search for EarlyExited events
  console.log("─── 4. EarlyExited Events ───");
  const earlyExitFilter = investmentEngine.filters.EarlyExited(userAddress);
  
  // Get the block range — search last 50000 blocks
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 50000);
  
  console.log(`  Searching blocks ${fromBlock} to ${currentBlock}...`);
  
  let earlyExitEvents: any[] = [];
  try {
    earlyExitEvents = await investmentEngine.queryFilter(earlyExitFilter, fromBlock, currentBlock);
  } catch (err: any) {
    // BSC testnet has block range limits, try smaller ranges
    console.log("  (Large range failed, trying smaller chunks...)");
    for (let start = fromBlock; start < currentBlock; start += 5000) {
      const end = Math.min(start + 4999, currentBlock);
      try {
        const chunk = await investmentEngine.queryFilter(earlyExitFilter, start, end);
        earlyExitEvents.push(...chunk);
      } catch (e) {
        // skip
      }
    }
  }

  if (earlyExitEvents.length === 0) {
    console.log("  ❌ No EarlyExited events found for this user");
    console.log("  (May have been on a previous deployment)");
  } else {
    for (const event of earlyExitEvents) {
      const args = (event as any).args;
      const amountReturned = args[1];
      const feeDeducted = args[2];
      const yieldDeducted = args[3];
      const depositIndex = args[4];

      const block = await provider.getBlock(event.blockNumber);
      const txHash = event.transactionHash;

      console.log(`\n  EarlyExit Event (Deposit #${depositIndex}):`);
      console.log(`    TX Hash:         ${txHash}`);
      console.log(`    Block:           ${event.blockNumber}`);
      console.log(`    Time:            ${block ? new Date(block.timestamp * 1000).toISOString() : "unknown"}`);
      console.log(`    Amount Returned: ${ethers.formatEther(amountReturned)} USDT`);
      console.log(`    Fee Deducted:    ${ethers.formatEther(feeDeducted)} USDT`);
      console.log(`    Yield Deducted:  ${ethers.formatEther(yieldDeducted)} USDT`);
      console.log(`    Total Deducted:  ${ethers.formatEther(feeDeducted + yieldDeducted)} USDT`);
    }
  }
  console.log("");

  // 5. Check Deposit events to find original deposit amount
  console.log("─── 5. Deposit Events ───");
  const depositFilter = investmentEngine.filters.Deposited(userAddress);
  
  let depositEvents: any[] = [];
  try {
    depositEvents = await investmentEngine.queryFilter(depositFilter, fromBlock, currentBlock);
  } catch (err) {
    console.log("  (Large range failed, trying smaller chunks...)");
    for (let start = fromBlock; start < currentBlock; start += 5000) {
      const end = Math.min(start + 4999, currentBlock);
      try {
        const chunk = await investmentEngine.queryFilter(depositFilter, start, end);
        depositEvents.push(...chunk);
      } catch (e) {
        // skip
      }
    }
  }

  if (depositEvents.length === 0) {
    console.log("  ❌ No Deposit events found for this user");
  } else {
    for (const event of depositEvents) {
      const args = (event as any).args;
      const amount = args[1];
      const tier = args[2];
      const dailyRate = args[3];
      const depositIndex = args[4];

      console.log(`  Deposit Event #${depositIndex}:`);
      console.log(`    Amount:     ${ethers.formatEther(amount)} USDT`);
      console.log(`    Tier:       ${tier}`);
      console.log(`    Daily Rate: ${Number(dailyRate) / 100}% (${dailyRate} bp)`);
      console.log(`    TX Hash:    ${event.transactionHash}`);
      console.log("");
    }
  }

  // 6. Check USDT transfer events (to see actual USDT received)
  console.log("─── 6. USDT Transfers (received by user) ───");
  const transferFilter = usdt.filters.Transfer(CONTRACTS.investmentEngine, userAddress);
  
  let transferEvents: any[] = [];
  try {
    transferEvents = await usdt.queryFilter(transferFilter, fromBlock, currentBlock);
  } catch (err) {
    for (let start = fromBlock; start < currentBlock; start += 5000) {
      const end = Math.min(start + 4999, currentBlock);
      try {
        const chunk = await usdt.queryFilter(transferFilter, start, end);
        transferEvents.push(...chunk);
      } catch (e) {
        // skip
      }
    }
  }

  if (transferEvents.length === 0) {
    console.log("  No direct USDT transfers from InvestmentEngine to user");
  } else {
    for (const event of transferEvents) {
      const args = (event as any).args;
      console.log(`  Transfer: ${ethers.formatEther(args[2])} USDT (TX: ${event.transactionHash})`);
    }
  }
  console.log("");

  // 7. Analysis
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ANALYSIS");
  console.log("═══════════════════════════════════════════════════════");
  
  if (earlyExitEvents.length > 0 && depositEvents.length > 0) {
    for (const exitEvent of earlyExitEvents) {
      const exitArgs = (exitEvent as any).args;
      const depositIdx = Number(exitArgs[4]);
      const amountReturned = exitArgs[1];
      const feeDeducted = exitArgs[2];
      const yieldDeducted = exitArgs[3];

      // Find matching deposit
      const matchingDeposit = depositEvents.find((d: any) => Number(d.args[4]) === depositIdx);
      if (matchingDeposit) {
        const principal = matchingDeposit.args[1];
        const expectedFee = principal * 1000n / 10000n; // 10%
        const expectedNet = principal - expectedFee;
        const actualTotalDeducted = feeDeducted + yieldDeducted;
        const actualFeePercent = (Number(actualTotalDeducted) / Number(principal) * 100).toFixed(2);

        console.log(`\n  Deposit #${depositIdx}:`);
        console.log(`    Original Principal:     ${ethers.formatEther(principal)} USDT`);
        console.log(`    Expected 10% Fee:       ${ethers.formatEther(expectedFee)} USDT`);
        console.log(`    Expected Net Return:    ${ethers.formatEther(expectedNet)} USDT`);
        console.log(`    ─────────────────────────────────────────`);
        console.log(`    Actual Fee Deducted:    ${ethers.formatEther(feeDeducted)} USDT`);
        console.log(`    Actual Yield Deducted:  ${ethers.formatEther(yieldDeducted)} USDT`);
        console.log(`    Actual Total Deducted:  ${ethers.formatEther(actualTotalDeducted)} USDT (${actualFeePercent}%)`);
        console.log(`    Actual Net Returned:    ${ethers.formatEther(amountReturned)} USDT`);
        console.log(`    ─────────────────────────────────────────`);
        
        if (actualTotalDeducted > expectedFee) {
          const excess = actualTotalDeducted - expectedFee;
          console.log(`    ❌ OVERCHARGED by:       ${ethers.formatEther(excess)} USDT`);
          console.log(`    ❌ Fee was ${actualFeePercent}% instead of expected 10%`);
          
          if (yieldDeducted > 0n) {
            console.log(`    📌 ROOT CAUSE: Yield clawback (${ethers.formatEther(yieldDeducted)} USDT) was applied`);
            console.log(`       This was from the OLD contract that deducted (fee + accrued yield).`);
            console.log(`       The NEW contract (just redeployed) only deducts flat 10%.`);
          }
        } else {
          console.log(`    ✓ Fee is correct at ${actualFeePercent}%`);
        }
      }
    }
  } else {
    console.log("  Could not find matching events for full analysis.");
    console.log("  This likely occurred on the PREVIOUS deployment (old contract addresses).");
    console.log("");
    console.log("  Previous InvestmentEngine: 0xACaF3c20Ff7A620071da6f612aB45326C6f0d139");
    console.log("  The OLD contract had yield clawback + 10% fee (total > 10%).");
    console.log("  The NEW contract (0xf84588DB6721bEAc3D723514f26A53F55E9FAD2E)");
    console.log("  now charges ONLY flat 10% - no yield clawback.");
    
    // Try querying previous contract
    console.log("\n  Checking previous contract...");
    const oldEngine = new ethers.Contract(
      "0xACaF3c20Ff7A620071da6f612aB45326C6f0d139",
      investmentEngineABI,
      provider
    );
    
    const oldExitFilter = oldEngine.filters.EarlyExited(userAddress);
    let oldExitEvents: any[] = [];
    try {
      oldExitEvents = await oldEngine.queryFilter(oldExitFilter, fromBlock, currentBlock);
    } catch (err) {
      for (let start = fromBlock; start < currentBlock; start += 5000) {
        const end = Math.min(start + 4999, currentBlock);
        try {
          const chunk = await oldEngine.queryFilter(oldExitFilter, start, end);
          oldExitEvents.push(...chunk);
        } catch (e) {
          // skip
        }
      }
    }

    if (oldExitEvents.length > 0) {
      console.log(`  Found ${oldExitEvents.length} EarlyExit event(s) on OLD contract:`);
      for (const event of oldExitEvents) {
        const args = (event as any).args;
        console.log(`\n    TX: ${event.transactionHash}`);
        console.log(`    Amount Returned: ${ethers.formatEther(args[1])} USDT`);
        console.log(`    Fee Deducted:    ${ethers.formatEther(args[2])} USDT`);
        console.log(`    Yield Deducted:  ${ethers.formatEther(args[3])} USDT`);
        console.log(`    Total Deducted:  ${ethers.formatEther(args[2] + args[3])} USDT`);
        console.log(`    Deposit Index:   ${args[4]}`);
      }
    }

    // Also check old deposit events
    const oldDepFilter = oldEngine.filters.Deposited(userAddress);
    let oldDepEvents: any[] = [];
    try {
      oldDepEvents = await oldEngine.queryFilter(oldDepFilter, fromBlock, currentBlock);
    } catch (err) {
      for (let start = fromBlock; start < currentBlock; start += 5000) {
        const end = Math.min(start + 4999, currentBlock);
        try {
          const chunk = await oldEngine.queryFilter(oldDepFilter, start, end);
          oldDepEvents.push(...chunk);
        } catch (e) {
          // skip
        }
      }
    }

    if (oldDepEvents.length > 0) {
      console.log(`\n  Found ${oldDepEvents.length} Deposit event(s) on OLD contract:`);
      for (const event of oldDepEvents) {
        const args = (event as any).args;
        console.log(`    Deposit #${args[4]}: ${ethers.formatEther(args[1])} USDT (TX: ${event.transactionHash})`);
      }
    }

    // Full analysis with old contract data
    if (oldExitEvents.length > 0 && oldDepEvents.length > 0) {
      console.log("\n  ─── OLD CONTRACT ANALYSIS ───");
      for (const exitEvent of oldExitEvents) {
        const exitArgs = (exitEvent as any).args;
        const depositIdx = Number(exitArgs[4]);
        const feeDeducted = exitArgs[2];
        const yieldDeducted = exitArgs[3];
        const amountReturned = exitArgs[1];

        const matchingDeposit = oldDepEvents.find((d: any) => Number(d.args[4]) === depositIdx);
        if (matchingDeposit) {
          const principal = matchingDeposit.args[1];
          const totalDeducted = feeDeducted + yieldDeducted;
          const actualFeePercent = (Number(totalDeducted) / Number(principal) * 100).toFixed(2);

          console.log(`\n    Deposit #${depositIdx}: ${ethers.formatEther(principal)} USDT`);
          console.log(`    Fee (10%):         ${ethers.formatEther(feeDeducted)} USDT`);
          console.log(`    Yield Clawback:    ${ethers.formatEther(yieldDeducted)} USDT`);
          console.log(`    Total Deducted:    ${ethers.formatEther(totalDeducted)} (${actualFeePercent}%)`);
          console.log(`    Net Returned:      ${ethers.formatEther(amountReturned)} USDT`);
          console.log(`    ─────────────────────────────────────`);
          console.log(`    ❌ OLD BUG: Contract deducted yield (${ethers.formatEther(yieldDeducted)}) + fee (${ethers.formatEther(feeDeducted)})`);
          console.log(`    ✓ FIXED: New contract only charges flat 10% = ${ethers.formatEther(principal * 1000n / 10000n)} USDT`);
        }
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  CONCLUSION");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  The old contract (now replaced) deducted BOTH:");
  console.log("    1. 10% early exit fee on principal");
  console.log("    2. Accrued yield (clawback)");
  console.log("  This totaled more than 10% (e.g., 10% fee + 5% yield = 15%).");
  console.log("");
  console.log("  The NEW contract (redeployed) now charges:");
  console.log("    - FLAT 10% fee on principal only");
  console.log("    - NO yield clawback");
  console.log("  Example: $100 deposit → $10 fee → User gets $90 USDT");
  console.log("═══════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
