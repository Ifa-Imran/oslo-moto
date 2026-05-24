import { ethers, network } from "hardhat";
import { setBalance, setStorageAt } from "@nomicfoundation/hardhat-network-helpers";

const INVESTMENT_ENGINE = "0x170FF70Ca6E941690434B2667569c30EDBd1691f";
const BUSD = "0xe33a47E2659Eb0F8ee4cb16c0ba1Ae0872aDdaBF";
const TEST_WALLET = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";
const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 BUSD

async function main() {
  console.log("=== Testing v7.1 Deposit (BUSD Transfer Fix) ===\n");

  const busd = await ethers.getContractAt("MockBUSD", BUSD);
  const investmentEngine = await ethers.getContractAt("OSLOInvestmentEngine", INVESTMENT_ENGINE);

  console.log("InvestmentEngine:", INVESTMENT_ENGINE);
  console.log("BUSD:", BUSD);
  console.log("Test Wallet:", TEST_WALLET);

  // Check balances
  const userBusdBalance = await busd.balanceOf(TEST_WALLET);
  const engineBusdBalance = await busd.balanceOf(INVESTMENT_ENGINE);

  console.log("\nBefore deposit:");
  console.log(`  User BUSD: ${ethers.formatEther(userBusdBalance)}`);
  console.log(`  Engine BUSD: ${ethers.formatEther(engineBusdBalance)}`);

  // Check allowance
  const allowance = await busd.allowance(TEST_WALLET, INVESTMENT_ENGINE);
  console.log(`  Allowance: ${ethers.formatEther(allowance)} BUSD`);

  if (allowance < DEPOSIT_AMOUNT) {
    console.log(`\n⚠️  Need to approve ${ethers.formatEther(DEPOSIT_AMOUNT)} BUSD first`);
    console.log("Please approve BUSD for InvestmentEngine from your wallet, then run this script again");
    return;
  }

  console.log("\nAttempting deposit...");
  try {
    // Switch to test wallet for the deposit
    const [deployer] = await ethers.getSigners();
    const testWalletSigner = await ethers.getImpersonatedSigner(TEST_WALLET);

    // Give test wallet some BNB for gas
    await setBalance(TEST_WALLET, ethers.parseEther("1.0"));

    const tx = await (investmentEngine as any).connect(testWalletSigner).deposit(DEPOSIT_AMOUNT);
    console.log("  Transaction sent:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("  ✓ Deposit successful!");
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

    // Check balances after
    const userBusdAfter = await busd.balanceOf(TEST_WALLET);
    const engineBusdAfter = await busd.balanceOf(INVESTMENT_ENGINE);
    
    console.log("\nAfter deposit:");
    console.log(`  User BUSD: ${ethers.formatEther(userBusdAfter)}`);
    console.log(`  Engine BUSD: ${ethers.formatEther(engineBusdAfter)}`);

    // Check investment details
    const investment = await investmentEngine.getUserInvestment(TEST_WALLET);
    console.log(`\nInvestment details:`);
    console.log(`  Total Deposited: ${ethers.formatEther(investment.totalDeposited)} BUSD`);
    console.log(`  Active: ${investment.isActive}`);
    console.log(`  Last ROI Claim: ${new Date(Number(investment.lastRoiClaimedAt) * 1000).toISOString()}`);

    console.log("\n✅ DEPOSIT TEST PASSED!");

  } catch (error: any) {
    console.log("\n❌ Deposit FAILED!");
    console.log("Error:", error.message);
    
    if (error.data) {
      console.log("\nError data:", error.data);
      
      // Try to decode
      const errorSelector = error.data.slice(0, 10);
      console.log("Error selector:", errorSelector);
      
      const errors: Record<string, string> = {
        "0xe450d38c": "OnlyLiquidityManager() - OSLODEX access control",
        "0x3b8f4493": "DepositTooLow() - Amount below minimum",
        "0x8b73c3d3": "AlreadyInvestingError() - User already has active investment",
      };
      
      if (errors[errorSelector]) {
        console.log("Decoded:", errors[errorSelector]);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
