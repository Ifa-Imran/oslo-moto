import { ethers } from "hardhat";

const TEST_USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";
const DEPOSIT_AMOUNT = ethers.parseEther("100");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing deposit from deployer account...");
  console.log("Deployer:", deployer.address);
  console.log("");

  const CONTRACTS = {
    busd: "0x7cE77ecb588eB907B4b4f06d19A6Be286FfcC70a",
    investmentEngine: "0x22cDa7FFff00965113e133b814447Ba418D1cbab",
  };

  const MockBUSD = await ethers.getContractFactory("MockBUSD");
  const busd = MockBUSD.attach(CONTRACTS.busd);

  console.log("=== TESTING DEPOSIT ===\n");

  // Check deployer balance
  console.log("1. Checking deployer BUSD balance...");
  const deployerBalance = await busd.balanceOf(deployer.address);
  console.log(`   Deployer balance: ${ethers.formatEther(deployerBalance)} BUSD`);
  
  if (deployerBalance < DEPOSIT_AMOUNT) {
    console.log(`   ❌ Insufficient! Minting 10,000 BUSD...`);
    await busd.mint(deployer.address, ethers.parseEther("10000"));
    console.log("   ✓ Minted!");
  }
  console.log("");

  // Approve
  console.log("2. Approving InvestmentEngine...");
  const tx1 = await (busd as any).approve(CONTRACTS.investmentEngine, DEPOSIT_AMOUNT);
  await tx1.wait();
  console.log("   ✓ Approved");
  console.log("");

  // Try deposit
  console.log("3. Attempting deposit...");
  try {
    const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
    const investmentEngine = OSLOInvestmentEngine.attach(CONTRACTS.investmentEngine);
    
    const tx2 = await (investmentEngine as any).deposit(DEPOSIT_AMOUNT);
    const receipt = await tx2.wait();
    
    console.log("   ✅ DEPOSIT SUCCESSFUL!");
    console.log(`   Transaction: ${receipt.hash}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    console.log("");
    console.log("   Your account is now ACTIVATED!");
    console.log("   - 100 BUSD deposited");
    console.log("   - ROI earnings started");
    console.log("   - Referral levels unlocked");
  } catch (err: any) {
    console.log("   ❌ Deposit failed!");
    console.log("   Error:", err.message);
    console.log("");
    console.log("   This error will also occur for the test user.");
    console.log("   The issue is in the contract logic, not the approval.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
