import { ethers } from "hardhat";

const TEST_USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Debugging registration for:", TEST_USER);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Contract addresses from latest deployment
  const CONTRACTS = {
    busd: "0x7cE77ecb588eB907B4b4f06d19A6Be286FfcC70a",
    referral: "0xE4830d02c8F3c2F2b2ba497999a2F43208785144",
    treasury: "0xA7e3E909D1FCB33432e383b32B7bE4B39F150109",
    osloToken: "0xe99D8a785C3bF89A3BA5B64C70863C5E110aed18",
  };

  // Load contracts
  const MockBUSD = await ethers.getContractFactory("MockBUSD");
  const OSLOReferral = await ethers.getContractFactory("OSLOReferral");
  
  const busd = MockBUSD.attach(CONTRACTS.busd);
  const referral = OSLOReferral.attach(CONTRACTS.referral);

  console.log("=== DEBUG REGISTRATION ===\n");

  // 1. Check user BUSD balance
  console.log("1. Checking BUSD balance...");
  const busdBalance = await busd.balanceOf(TEST_USER);
  const busdBalanceFormatted = ethers.formatEther(busdBalance);
  console.log(`   User BUSD balance: ${busdBalanceFormatted} BUSD`);
  
  if (busdBalance === 0n) {
    console.log("   ❌ ERROR: User has 0 BUSD! Minting 100 BUSD...");
    await busd.mint(TEST_USER, ethers.parseEther("100"));
    console.log("   ✓ Minted 100 BUSD to user");
    const newBalance = await busd.balanceOf(TEST_USER);
    console.log(`   ✓ New balance: ${ethers.formatEther(newBalance)} BUSD`);
  } else if (busdBalance < ethers.parseEther("5")) {
    console.log(`   ❌ ERROR: User has insufficient BUSD (${busdBalanceFormatted} < 5)`);
    console.log("   Minting 100 BUSD...");
    await busd.mint(TEST_USER, ethers.parseEther("100"));
    console.log("   ✓ Minted 100 BUSD to user");
  } else {
    console.log("   ✓ User has sufficient BUSD");
  }
  console.log("");

  // 2. Check if user is already registered
  console.log("2. Checking registration status...");
  const userInfo = await referral.userInfo(TEST_USER);
  console.log(`   Registered: ${userInfo.registered}`);
  
  if (userInfo.registered) {
    console.log("   ❌ User is already registered!");
    console.log(`   Referrer: ${userInfo.referrer}`);
    console.log(`   Unlocked levels: ${userInfo.unlockedLevels}`);
    return;
  } else {
    console.log("   ✓ User is not registered (good)");
  }
  console.log("");

  // 3. Check total registered count
  console.log("3. Checking total registered...");
  const totalRegistered = await referral.totalRegistered();
  console.log(`   Total registered: ${totalRegistered}`);
  console.log(`   This will be user #${Number(totalRegistered) + 1}`);
  console.log("");

  // 4. Check BUSD allowance
  console.log("4. Checking BUSD allowance for Referral contract...");
  const allowance = await busd.allowance(TEST_USER, CONTRACTS.referral);
  const allowanceFormatted = ethers.formatEther(allowance);
  console.log(`   Allowance: ${allowanceFormatted} BUSD`);
  
  const REGISTRATION_FEE = ethers.parseEther("5");
  if (allowance < REGISTRATION_FEE) {
    console.log("   ❌ Allowance insufficient, checking if deployer can approve on behalf...");
    console.log("   Note: User must approve themselves, cannot approve for them");
  } else {
    console.log("   ✓ Allowance sufficient");
  }
  console.log("");

  // 5. Check treasury address
  console.log("5. Checking treasury address...");
  const treasuryAddr = await referral.treasury();
  console.log(`   Treasury: ${treasuryAddr}`);
  console.log(`   Expected: ${CONTRACTS.treasury}`);
  console.log(`   Match: ${treasuryAddr.toLowerCase() === CONTRACTS.treasury.toLowerCase()}`);
  console.log("");

  // 6. Check OSLOToken early adopter vault
  console.log("6. Checking OSLO Token early adopter vault...");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const osloToken = OSLOToken.attach(CONTRACTS.osloToken);
  const earlyAdopterVault = await osloToken.earlyAdopterVault();
  console.log(`   Early adopter vault: ${earlyAdopterVault}`);
  
  const vaultBalance = await osloToken.balanceOf(earlyAdopterVault);
  console.log(`   Vault OSLO balance: ${ethers.formatEther(vaultBalance)} OSLO`);
  console.log("");

  // 7. Attempt registration (simulate with deployer for debugging)
  console.log("7. Testing registration (this will fail if user hasn't approved)...");
  console.log("   Note: This simulates what the frontend does");
  console.log("");

  try {
    // Try to get user's approval (this requires user's private key, which we don't have)
    // So instead, let's check what the frontend should do
    
    console.log("=== FRONTEND REGISTRATION FLOW ===");
    console.log("Step 1: User must approve BUSD for Referral contract");
    console.log("   - Call: busd.approve(referral, 5 ether)");
    console.log("   - Must be called from user's wallet");
    console.log("   - User address:", TEST_USER);
    console.log("");
    console.log("Step 2: Call register function");
    console.log("   - Call: referral.register(user, referrer)");
    console.log("   - User:", TEST_USER);
    console.log("   - Referrer:", totalRegistered === 0n ? "0x0 (root)" : "must provide valid referrer");
    console.log("");
    
    // If user is first, register with zero address
    if (totalRegistered === 0n) {
      console.log("   This is the FIRST user (root) - referrer = address(0)");
      console.log("   Attempting registration as deployer (will show exact error)...");
      
      // This will fail because we're not the user, but will show us the error
      try {
        const tx = await referral.register(TEST_USER, ethers.ZeroAddress);
        await tx.wait();
        console.log("   ✓ Registration successful!");
      } catch (err: any) {
        console.log("   ❌ Registration failed with error:");
        console.log("   Error:", err.message);
        if (err.data) {
          console.log("   Data:", err.data);
        }
      }
    } else {
      console.log("   This is NOT the first user - needs a valid referrer");
      console.log("   Please provide a referrer address that is already registered");
    }

  } catch (err: any) {
    console.log("Error:", err.message);
  }

  console.log("\n=== DEBUG SUMMARY ===");
  console.log("User:", TEST_USER);
  console.log("BUSD Balance:", ethers.formatEther(await busd.balanceOf(TEST_USER)), "BUSD");
  console.log("BUSD Allowance:", ethers.formatEther(await busd.allowance(TEST_USER, CONTRACTS.referral)), "BUSD");
  console.log("Already Registered:", (await referral.userInfo(TEST_USER)).registered);
  console.log("Total Registered:", await referral.totalRegistered());
  console.log("\nMost likely issue: User hasn't approved BUSD for the Referral contract");
  console.log("Solution: Frontend must call busd.approve(referral, 5 ether) from user's wallet first");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
