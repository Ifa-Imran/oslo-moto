import { ethers } from "hardhat";

// User wallet that will test early exit
const USER_KEY = "12a9cb3664652015634f42172b8bee47af5abd2fcb65bc8943178c4a36f2a8ca";

// New deployment addresses
const CONTRACTS = {
  usdt: "0x913B0B8E3978Aacc87EBc4e8685961FB44b493ba",
  osloToken: "0xa6ea0ee82A88b6316df025393C202B554428306b",
  investmentEngine: "0x25A3b2b89F37Af7a125a6AE31cAAbc0d2beB77fD",
  referral: "0x7Cb8B1CF41EF628A717A0F493F932e5867EdFDCd",
  osloDEX: "0xF8F32d43598fed93efe803A1EFc7c2428e8ac140",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider!;
  const userWallet = new ethers.Wallet(USER_KEY, provider);
  const userAddress = userWallet.address;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  VERIFY: Early Exit = Flat 10% Fee");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`User:     ${userAddress}`);
  console.log("");

  // Get contract instances
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = MockUSDT.attach(CONTRACTS.usdt) as any;
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  const referral = OSLOReferral.attach(CONTRACTS.referral) as any;
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const investmentEngine = OSLOInvestmentEngine.attach(CONTRACTS.investmentEngine) as any;

  // Step 1: Send user some BNB for gas
  console.log("1. Sending BNB for gas...");
  const gasBalance = await provider.getBalance(userAddress);
  if (gasBalance < ethers.parseEther("0.01")) {
    const tx = await deployer.sendTransaction({ to: userAddress, value: ethers.parseEther("0.02") });
    await tx.wait();
    console.log("   Sent 0.02 BNB");
  } else {
    console.log("   Already has gas");
  }

  // Step 2: Mint USDT to user
  console.log("2. Minting USDT...");
  let tx = await usdt.mint(userAddress, ethers.parseEther("1000"));
  await tx.wait();
  console.log("   Minted 1000 USDT");

  // Step 3: Register user (need referral)
  console.log("3. Registering user...");
  const userInfo = await referral.userInfo(userAddress);
  if (!userInfo.registered) {
    // Approve registration fee (1 USDT) - fee is taken from user
    const usdtUser = usdt.connect(userWallet) as any;
    tx = await usdtUser.approve(CONTRACTS.referral, ethers.parseEther("1"));
    await tx.wait();
    
    const referralUser = referral.connect(userWallet) as any;
    tx = await referralUser.register(userAddress, deployer.address); // register(user, referrer)
    await tx.wait();
    console.log("   Registered under deployer");
  } else {
    console.log("   Already registered");
  }

  // Step 4: Deposit 200 USDT
  console.log("4. Depositing 200 USDT...");
  const DEPOSIT_AMOUNT = ethers.parseEther("200");
  
  const balanceBefore = await usdt.balanceOf(userAddress);
  console.log(`   Balance before deposit: ${ethers.formatEther(balanceBefore)} USDT`);
  
  const usdtUser = usdt.connect(userWallet) as any;
  tx = await usdtUser.approve(CONTRACTS.investmentEngine, DEPOSIT_AMOUNT);
  await tx.wait();
  
  const engineUser = investmentEngine.connect(userWallet) as any;
  tx = await engineUser.deposit(DEPOSIT_AMOUNT);
  await tx.wait();
  
  const balanceAfterDeposit = await usdt.balanceOf(userAddress);
  console.log(`   Balance after deposit:  ${ethers.formatEther(balanceAfterDeposit)} USDT`);
  console.log(`   Spent on deposit: ${ethers.formatEther(balanceBefore - balanceAfterDeposit)} USDT`);
  console.log("");

  // Step 5: Early exit immediately
  console.log("5. Performing Early Exit...");
  tx = await engineUser.earlyExit(0);
  await tx.wait();
  
  const balanceAfterExit = await usdt.balanceOf(userAddress);
  console.log(`   Balance after exit:     ${ethers.formatEther(balanceAfterExit)} USDT`);
  console.log("");

  // Step 6: Calculate results
  console.log("═══════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════");
  
  const amountReceived = BigInt(balanceAfterExit) - BigInt(balanceAfterDeposit);
  const expectedReturn = DEPOSIT_AMOUNT * 9000n / 10000n; // 90% of 200 = 180
  const expectedFee = DEPOSIT_AMOUNT * 1000n / 10000n;    // 10% of 200 = 20
  const actualFee = DEPOSIT_AMOUNT - amountReceived;
  const feePercent = Number(actualFee) / Number(DEPOSIT_AMOUNT) * 100;

  console.log(`  Deposit:          ${ethers.formatEther(DEPOSIT_AMOUNT)} USDT`);
  console.log(`  Expected return:  ${ethers.formatEther(expectedReturn)} USDT (90%)`);
  console.log(`  Expected fee:     ${ethers.formatEther(expectedFee)} USDT (10%)`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Actual received:  ${ethers.formatEther(amountReceived)} USDT`);
  console.log(`  Actual fee:       ${ethers.formatEther(actualFee)} USDT (${feePercent.toFixed(2)}%)`);
  console.log(`  ─────────────────────────────────────────`);
  
  // Allow small rounding tolerance (0.01%)
  const tolerance = DEPOSIT_AMOUNT / 10000n; // 0.01% = 0.02 USDT
  if (amountReceived >= expectedReturn - tolerance && amountReceived <= expectedReturn + tolerance) {
    console.log(`  ✅ PASS: Fee is exactly 10% (±0.01% tolerance)`);
  } else if (amountReceived > expectedReturn) {
    console.log(`  ⚠️  User received MORE than expected (likely rounding in their favor)`);
  } else {
    const shortfall = expectedReturn - amountReceived;
    const shortfallPercent = Number(shortfall) / Number(DEPOSIT_AMOUNT) * 100;
    console.log(`  ❌ FAIL: User received ${ethers.formatEther(shortfall)} USDT less than expected`);
    console.log(`           That's ${shortfallPercent.toFixed(4)}% extra deduction`);
  }
  console.log("═══════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
