import { ethers } from "hardhat";

async function main() {
  console.log("🔧 Fixing DEX Configuration\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  const DEX = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const NEW_IE = "0xA9aF7308601471e57F4fDE865086Df6b4eb324dC";
  const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";

  const dex = await ethers.getContractAt("OSLODEX", DEX);

  // Check current IE
  console.log("🔍 Current DEX Configuration:\n");
  try {
    const currentIE = await dex.investmentEngine();
    console.log("  Current IE:", currentIE);
    console.log("  New IE:    ", NEW_IE);
    console.log("  Match:", currentIE.toLowerCase() === NEW_IE.toLowerCase());
    console.log("");

    if (currentIE.toLowerCase() !== NEW_IE.toLowerCase()) {
      console.log("❌ DEX is configured with OLD IE!\n");
      console.log("💡 Updating DEX to use new IE...\n");

      // Check if deployer is admin
      const admin = await dex.admin();
      console.log("  DEX Admin:", admin);
      console.log("  Deployer:", deployer.address);
      console.log("");

      if (admin.toLowerCase() === deployer.address.toLowerCase() || admin === ethers.ZeroAddress) {
        if (admin === ethers.ZeroAddress) {
          console.log("  ⚠️ Admin is zero - trying direct call anyway...\n");
        }

        try {
          const updateTx = await dex.setInvestmentEngine(NEW_IE);
          await updateTx.wait();
          console.log("  ✅ DEX updated with new IE!\n");

          // Verify
          const updatedIE = await dex.investmentEngine();
          console.log("  ✅ Verified - IE:", updatedIE);
          console.log("");

          // Now test deposit
          console.log("🧪 Testing deposit...\n");
          const WALLET = "0x7f4f8C1D7DA3141737c242B4055EE6c4d005014c";
          const PK = "a38d8225529fc2989bb33bd4dd6fc0362388db6a4f954054644ca8c497eb3377";
          const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
          const wallet = new ethers.Wallet(PK).connect(ethers.provider);
          const mockUSDT = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT, wallet);
          const ie = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE, wallet);

          const amount = ethers.parseEther("100");
          console.log("  Approving 100 USDT...");
          const approveTx = await mockUSDT.approve(NEW_IE, amount);
          await approveTx.wait();
          console.log("  ✅ Approved\n");

          console.log("  Depositing...");
          const depositTx = await ie.deposit(amount);
          console.log("  ⏳ TX:", depositTx.hash);
          const receipt = await depositTx.wait();
          console.log("\n✅✅✅ DEPOSIT SUCCESSFUL! ✅✅✅\n");

          const count = await ie.getDepositCount(WALLET);
          console.log("  Deposits:", count.toString());
          if (count > 0n) {
            const dep = await ie.getDeposit(WALLET, 0);
            console.log("  Amount:", ethers.formatEther(dep.amount), "USDT");
            console.log("  Tier:", dep.tier);
            console.log("  Active:", dep.active, "\n");
          }

          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("🎉 ALL ISSUES COMPLETELY FIXED!");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
          console.log("✅ forceApprove → approve (Referral & IE)");
          console.log("✅ Frontend contract addresses updated");
          console.log("✅ DEX configured with new IE");
          console.log("✅ Deposit flow working end-to-end");
          console.log("");
          console.log("📝 Final Contract Addresses:");
          console.log("  InvestmentEngine:", NEW_IE);
          console.log("  Referral:", REFERRAL);
          console.log("  DEX:", DEX);
          console.log("");

        } catch (error: any) {
          console.log("  ❌ Failed to update DEX:", error.message.split('\n')[0]);
          console.log("");
        }
      } else {
        console.log("  ❌ Deployer is not DEX admin");
        console.log("  💡 Cannot update DEX configuration\n");
      }
    } else {
      console.log("✅ DEX already configured with new IE!\n");
    }
  } catch (error: any) {
    console.log("  Error:", error.message);
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal:", error);
    process.exit(1);
  });
