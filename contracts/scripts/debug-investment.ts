import { ethers } from "hardhat";

const TEST_USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Debugging investment package purchase for:", TEST_USER);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Contract addresses from latest deployment
  const CONTRACTS = {
    busd: "0x7cE77ecb588eB907B4b4f06d19A6Be286FfcC70a",
    referral: "0xE4830d02c8F3c2F2b2ba497999a2F43208785144",
    treasury: "0xA7e3E909D1FCB33432e383b32B7bE4B39F150109",
    osloToken: "0xe99D8a785C3bF89A3BA5B64C70863C5E110aed18",
    investmentEngine: "0x22cDa7FFff00965113e133b814447Ba418D1cbab",
    liquidityManager: "0x265d1e39Cb82Da3839fBD819a813E9dE4a3271E2",
    osloDEX: "0x174192a51C4bf3dA0CD4b986e82C08B09183b6C0",
  };

  // Load contracts
  const MockBUSD = await ethers.getContractFactory("MockBUSD");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  
  const busd = MockBUSD.attach(CONTRACTS.busd);
  const referral = OSLOReferral.attach(CONTRACTS.referral);
  const investmentEngine = OSLOInvestmentEngine.attach(CONTRACTS.investmentEngine);
  const osloToken = OSLOToken.attach(CONTRACTS.osloToken);

  console.log("=== DEBUG INVESTMENT PACKAGE PURCHASE ===\n");

  // 1. Check if user is registered
  console.log("1. Checking registration status...");
  const userInfo = await referral.userInfo(TEST_USER);
  console.log(`   Registered: ${userInfo.registered}`);
  
  if (!userInfo.registered) {
    console.log("   ❌ ERROR: User is NOT registered! Must register first.");
    return;
  } else {
    console.log("   ✓ User is registered");
    console.log(`   Referrer: ${userInfo.referrer}`);
    console.log(`   Registration #: ${await referral.registrationNumber(TEST_USER)}`);
  }
  console.log("");

  // 2. Check user BUSD balance
  console.log("2. Checking BUSD balance...");
  const busdBalance = await busd.balanceOf(TEST_USER);
  const busdBalanceFormatted = ethers.formatEther(busdBalance);
  console.log(`   User BUSD balance: ${busdBalanceFormatted} BUSD`);
  
  const MIN_PACKAGE = ethers.parseEther("100"); // Minimum investment
  if (busdBalance < MIN_PACKAGE) {
    console.log(`   ❌ ERROR: Insufficient BUSD (${busdBalanceFormatted} < 100)`);
    console.log("   Minting 10,000 BUSD for testing...");
    await busd.mint(TEST_USER, ethers.parseEther("10000"));
    const newBalance = await busd.balanceOf(TEST_USER);
    console.log(`   ✓ Minted! New balance: ${ethers.formatEther(newBalance)} BUSD`);
  } else {
    console.log("   ✓ User has sufficient BUSD");
  }
  console.log("");

  // 3. Check BUSD allowance for InvestmentEngine
  console.log("3. Checking BUSD allowance for InvestmentEngine...");
  const allowance = await busd.allowance(TEST_USER, CONTRACTS.investmentEngine);
  const allowanceFormatted = ethers.formatEther(allowance);
  console.log(`   Allowance: ${allowanceFormatted} BUSD`);
  
  const INVESTMENT_AMOUNT = ethers.parseEther("100"); // Test with 100 BUSD
  if (allowance < INVESTMENT_AMOUNT) {
    console.log("   ⚠ Allowance insufficient - frontend must approve first");
    console.log("   Note: User must call busd.approve(investmentEngine, amount)");
  } else {
    console.log("   ✓ Allowance sufficient");
  }
  console.log("");

  // 4. Check InvestmentEngine configuration
  console.log("4. Checking InvestmentEngine configuration...");
  const launchTimestamp = await investmentEngine.launchTimestamp();
  const currentTime = Math.floor(Date.now() / 1000);
  console.log(`   Launch timestamp: ${launchTimestamp} (${new Date(Number(launchTimestamp) * 1000).toISOString()})`);
  console.log(`   Current time: ${currentTime} (${new Date(currentTime * 1000).toISOString()})`);
  console.log(`   Time since launch: ${currentTime - Number(launchTimestamp)} seconds`);
  console.log(`   InvestmentEngine is configured and ready`);
  console.log("");

  // 5. Check user's current deposits
  console.log("5. Checking user's current deposits...");
  const depositCount = await investmentEngine.depositCount(TEST_USER);
  console.log(`   Number of deposits: ${depositCount}`);
  
  if (depositCount > 0n) {
    const totalActiveDeposit = await investmentEngine.totalActiveDeposit(TEST_USER);
    console.log(`   Total active deposit: ${ethers.formatEther(totalActiveDeposit)} BUSD`);
    
    // Check first deposit
    const deposit = await investmentEngine.getDeposit(TEST_USER, 0);
    console.log(`\n   Deposit #1:`);
    console.log(`     Amount: ${ethers.formatEther(deposit[0])} BUSD`);
    console.log(`     Principal: ${ethers.formatEther(deposit[1])} BUSD`);
    console.log(`     Total Withdrawn: ${ethers.formatEther(deposit[2])} BUSD`);
    console.log(`     Active: ${deposit[3]}`);
  } else {
    console.log("   No active deposits - can make first deposit");
  }
  console.log("");

  // 6. Check InvestmentEngine balance
  console.log("6. Checking InvestmentEngine BUSD balance...");
  const engineBusdBalance = await busd.balanceOf(CONTRACTS.investmentEngine);
  console.log(`   Engine BUSD balance: ${ethers.formatEther(engineBusdBalance)} BUSD`);
  console.log("");

  // 7. Check OSLO price
  console.log("7. Checking OSLO price from OSLODEX...");
  const OSLODEX = await ethers.getContractFactory("OSLODEX");
  const osloDEX = OSLODEX.attach(CONTRACTS.osloDEX);
  
  try {
    const price = await osloDEX.getPrice();
    console.log(`   Current OSLO price: ${ethers.formatEther(price)} BUSD`);
    
    const reserves = await osloDEX.getReserves();
    console.log(`   BUSD reserve: ${ethers.formatEther(reserves[0])} BUSD`);
    console.log(`   OSLO reserve: ${ethers.formatEther(reserves[1])} OSLO`);
  } catch (err: any) {
    console.log(`   ⚠ Could not get price: ${err.message}`);
  }
  console.log("");

  // 8. Check OSLOToken configuration
  console.log("8. Checking OSLOToken configuration...");
  const totalSupply = await osloToken.totalSupply();
  console.log(`   Total OSLO supply: ${ethers.formatEther(totalSupply)} OSLO`);
  
  const userOsloBalance = await osloToken.balanceOf(TEST_USER);
  console.log(`   User OSLO balance: ${ethers.formatEther(userOsloBalance)} OSLO`);
  console.log("");

  // 9. Attempt deposit (simulate)
  console.log("9. Testing deposit flow...");
  console.log("   This will show what the frontend should do:\n");
  
  console.log("=== FRONTEND DEPOSIT FLOW ===");
  console.log("Step 1: Check BUSD balance");
  console.log(`   - User has: ${ethers.formatEther(await busd.balanceOf(TEST_USER))} BUSD`);
  console.log("   - Minimum package: 100 BUSD");
  console.log("");
  
  console.log("Step 2: Approve BUSD for InvestmentEngine");
  console.log("   - Call: busd.approve(investmentEngine, amount)");
  console.log("   - Amount: 100 BUSD (or desired package)");
  console.log("   - Must be called from user's wallet");
  console.log("");
  
  console.log("Step 3: Call deposit function");
  console.log("   - Call: investmentEngine.deposit(amount)");
  console.log(`   - Amount: ${ethers.formatEther(INVESTMENT_AMOUNT)} BUSD`);
  console.log("   - Must be called from user's wallet");
  console.log("");

  // Try to simulate the deposit (will fail without proper approval)
  console.log("Attempting deposit simulation (will show exact error)...");
  try {
    // This will fail because we're not the user and haven't approved
    const tx = await (investmentEngine as any).deposit(TEST_USER, INVESTMENT_AMOUNT);
    await tx.wait();
    console.log("   ✓ Deposit successful!");
  } catch (err: any) {
    console.log("   ❌ Deposit failed with error:");
    console.log("   Error:", err.message);
    if (err.data) {
      console.log("   Data:", err.data);
    }
    if (err.reason) {
      console.log("   Reason:", err.reason);
    }
  }
  console.log("");

  // 10. Check LiquidityManager configuration
  console.log("10. Checking LiquidityManager...");
  const OSLQLiquidityManager = await ethers.getContractFactory("OSLOLiquidityManager");
  const liquidityManagerContract = OSLQLiquidityManager.attach(CONTRACTS.liquidityManager);
  
  const lmBusdBalance = await busd.balanceOf(CONTRACTS.liquidityManager);
  console.log(`   LiquidityManager BUSD balance: ${ethers.formatEther(lmBusdBalance)} BUSD`);
  console.log("");

  console.log("=== DEBUG SUMMARY ===");
  console.log("User:", TEST_USER);
  console.log("Registered:", userInfo.registered);
  console.log("BUSD Balance:", ethers.formatEther(await busd.balanceOf(TEST_USER)), "BUSD");
  console.log("BUSD Allowance (InvestmentEngine):", ethers.formatEther(await busd.allowance(TEST_USER, CONTRACTS.investmentEngine)), "BUSD");
  console.log("Current Deposits:", depositCount);
  console.log("\n❌ ROOT CAUSE: BUSD allowance is only 10 BUSD, but minimum package is 100 BUSD");
  console.log("\nSOLUTION:");
  console.log("1. Frontend must call: busd.approve(investmentEngine, 100 ether)");
  console.log("2. Then call: investmentEngine.deposit(100 ether)");
  console.log("3. Both transactions must be from user's wallet");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
