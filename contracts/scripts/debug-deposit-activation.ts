import { ethers } from "hardhat";

const TEST_USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";
const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 BUSD

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Debugging deposit activation for:", TEST_USER);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Contract addresses
  const CONTRACTS = {
    busd: "0x7cE77ecb588eB907B4b4f06d19A6Be286FfcC70a",
    referral: "0xE4830d02c8F3c2F2b2ba497999a2F43208785144",
    investmentEngine: "0x22cDa7FFff00965113e133b814447Ba418D1cbab",
    liquidityManager: "0x265d1e39Cb82Da3839fBD819a813E9dE4a3271E2",
    osloDEX: "0x174192a51C4bf3dA0CD4b986e82C08B09183b6C0",
    osloToken: "0xe99D8a785C3bF89A3BA5B64C70863C5E110aed18",
    treasury: "0xA7e3E909D1FCB33432e383b32B7bE4B39F150109",
  };

  // Load contracts
  const MockBUSD = await ethers.getContractFactory("MockBUSD");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const OSLOLiquidityManager = await ethers.getContractFactory("OSLOLiquidityManager");
  
  const busd = MockBUSD.attach(CONTRACTS.busd);
  const referral = OSLOReferral.attach(CONTRACTS.referral);
  const investmentEngine = OSLOInvestmentEngine.attach(CONTRACTS.investmentEngine);
  const osloToken = OSLOToken.attach(CONTRACTS.osloToken);
  const liquidityManager = OSLOLiquidityManager.attach(CONTRACTS.liquidityManager);

  console.log("=== DEBUG DEPOSIT ACTIVATION ===\n");

  // 1. Check registration
  console.log("1. Checking registration...");
  const userInfo = await referral.userInfo(TEST_USER);
  console.log(`   Registered: ${userInfo.registered}`);
  if (!userInfo.registered) {
    console.log("   ❌ ERROR: User not registered! Must register first.");
    return;
  }
  console.log("   ✓ User is registered");
  console.log("");

  // 2. Check BUSD balance
  console.log("2. Checking BUSD balance...");
  const userBalance = await busd.balanceOf(TEST_USER);
  console.log(`   User balance: ${ethers.formatEther(userBalance)} BUSD`);
  if (userBalance < DEPOSIT_AMOUNT) {
    console.log(`   ❌ ERROR: Insufficient balance (${ethers.formatEther(userBalance)} < ${ethers.formatEther(DEPOSIT_AMOUNT)})`);
    return;
  }
  console.log("   ✓ Sufficient balance");
  console.log("");

  // 3. Check BUSD allowance
  console.log("3. Checking BUSD allowance...");
  const allowance = await busd.allowance(TEST_USER, CONTRACTS.investmentEngine);
  console.log(`   Allowance: ${ethers.formatEther(allowance)} BUSD`);
  if (allowance < DEPOSIT_AMOUNT) {
    console.log(`   ❌ ERROR: Insufficient allowance (${ethers.formatEther(allowance)} < ${ethers.formatEther(DEPOSIT_AMOUNT)})`);
    return;
  }
  console.log("   ✓ Sufficient allowance");
  console.log("");

  // 4. Check InvestmentEngine configuration
  console.log("4. Checking InvestmentEngine configuration...");
  
  try {
    const launchTimestamp = await investmentEngine.launchTimestamp();
    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`   Launch timestamp: ${launchTimestamp}`);
    console.log(`   Current time: ${currentTime}`);
    console.log(`   Time since launch: ${currentTime - Number(launchTimestamp)} seconds`);
    
    // Check if engine has required addresses set
    const engineAddress = await investmentEngine.osloToken();
    console.log(`   OSLO Token: ${engineAddress}`);
    console.log(`   Match: ${engineAddress.toLowerCase() === CONTRACTS.osloToken.toLowerCase()}`);
  } catch (err: any) {
    console.log(`   ❌ ERROR reading config: ${err.message}`);
  }
  console.log("");

  // 5. Check minimum deposit
  console.log("5. Checking minimum deposit...");
  try {
    // Try to get minimum deposit if the function exists
    const minDeposit = await (investmentEngine as any).MIN_DEPOSIT?.();
    if (minDeposit) {
      console.log(`   Minimum deposit: ${ethers.formatEther(minDeposit)} BUSD`);
      if (DEPOSIT_AMOUNT < minDeposit) {
        console.log(`   ❌ ERROR: Deposit amount too low (${ethers.formatEther(DEPOSIT_AMOUNT)} < ${ethers.formatEther(minDeposit)})`);
        return;
      }
      console.log("   ✓ Above minimum");
    } else {
      console.log("   No minimum deposit function found");
    }
  } catch (err: any) {
    console.log("   Could not check minimum deposit (function may not exist)");
  }
  console.log("");

  // 6. Check InvestmentEngine BUSD balance
  console.log("6. Checking InvestmentEngine BUSD balance...");
  const engineBalance = await busd.balanceOf(CONTRACTS.investmentEngine);
  console.log(`   Engine balance: ${ethers.formatEther(engineBalance)} BUSD`);
  console.log("");

  // 7. Check user's existing deposits
  console.log("7. Checking user's deposits...");
  try {
    const totalActiveDeposit = await investmentEngine.totalActiveDeposit(TEST_USER);
    console.log(`   Total active deposit: ${ethers.formatEther(totalActiveDeposit)} BUSD`);
    
    // Try to get deposit count
    try {
      const depositCount = await (investmentEngine as any).depositCount?.(TEST_USER);
      if (depositCount !== undefined) {
        console.log(`   Deposit count: ${depositCount}`);
      }
    } catch (err: any) {
      console.log("   Could not get deposit count");
    }
  } catch (err: any) {
    console.log(`   Error checking deposits: ${err.message}`);
  }
  console.log("");

  // 8. Check LiquidityManager configuration
  console.log("8. Checking LiquidityManager...");
  try {
    const lmBusdBalance = await busd.balanceOf(CONTRACTS.liquidityManager);
    console.log(`   LiquidityManager BUSD: ${ethers.formatEther(lmBusdBalance)} BUSD`);
  } catch (err: any) {
    console.log(`   Error: ${err.message}`);
  }
  console.log("");

  // 9. Attempt deposit to see exact error
  console.log("9. Attempting deposit to capture error...");
  console.log("   This will show the exact revert reason:\n");
  
  try {
    // Try calling deposit from deployer (will fail, but shows error)
    const tx = await (investmentEngine as any).deposit(DEPOSIT_AMOUNT);
    await tx.wait();
    console.log("   ✓ Deposit successful!");
  } catch (err: any) {
    console.log("   ❌ Deposit FAILED with error:");
    console.log("   Message:", err.message);
    
    // Try to decode the error
    if (err.data) {
      console.log("   Data:", err.data);
    }
    if (err.reason) {
      console.log("   Reason:", err.reason);
    }
    if (err.error) {
      console.log("   Error:", err.error);
    }
    
    // Check for common error codes
    if (err.message.includes("0x")) {
      const errorCode = err.message.match(/0x[a-fA-F0-9]{8}/)?.[0];
      if (errorCode) {
        console.log("\n   === ERROR CODE ===");
        console.log("   Code:", errorCode);
        
        // Common Solidity error codes
        const errorMap: Record<string, string> = {
          "0x4e487b71": "Panic: Arithmetic overflow/underflow",
          "0x1031da4e": "Transfer failed",
          "0x9825e5eb": "Insufficient balance",
          "0xe450d38c": "Access control: caller is not authorized",
          "0x7939f424": "ReentrancyGuard: reentrant call",
          "0x30cd7471": "Invalid amount",
          "0x8f91b00c": "Invalid state",
        };
        
        if (errorMap[errorCode]) {
          console.log("   Meaning:", errorMap[errorCode]);
        } else {
          console.log("   Unknown error code - check contract source");
        }
      }
    }
  }
  console.log("");

  // 10. Show exact steps to fix
  console.log("=== DIAGNOSIS & SOLUTION ===\n");
  console.log("User:", TEST_USER);
  console.log("Registered:", userInfo.registered);
  console.log("BUSD Balance:", ethers.formatEther(userBalance), "BUSD");
  console.log("BUSD Allowance:", ethers.formatEther(allowance), "BUSD");
  console.log("Deposit Amount:", ethers.formatEther(DEPOSIT_AMOUNT), "BUSD");
  console.log("");
  
  console.log("Common causes of 'execution reverted':");
  console.log("1. ❌ User not registered → Must register first");
  console.log("2. ❌ Insufficient BUSD balance → Need 100+ BUSD");
  console.log("3. ❌ Insufficient BUSD allowance → Must approve InvestmentEngine");
  console.log("4. ❌ Deposit amount below minimum → Check MIN_DEPOSIT");
  console.log("5. ❌ Contract not properly configured → Check addresses");
  console.log("6. ❌ InvestmentEngine paused/disabled → Check if active");
  console.log("7. ❌ LiquidityManager not configured → Must be set");
  console.log("");
  
  console.log("Next steps:");
  console.log("1. Check the error message above for the specific revert reason");
  console.log("2. If it's an access control error, check contract permissions");
  console.log("3. If it's a transfer error, check balances and approvals");
  console.log("4. Use BSCScan to view the failed transaction for more details");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
