import { ethers } from "hardhat";

async function main() {
  console.log("🔧 Fix Registration by Disabling DEX Temporarily\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  const REFERRAL_ADDRESS = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);

  // Check current DEX address
  const currentDex = await referral.osloDex();
  console.log("📊 Current DEX Address:", currentDex);

  if (currentDex === ethers.ZeroAddress) {
    console.log("✅ DEX is already disabled!");
    console.log("💡 Registration should work now without DEX injection.\n");
  } else {
    console.log("⚠️  DEX is configured, which is causing registration to fail");
    console.log("💡 To fix: Set DEX address to zero address temporarily");
    console.log("💡 Or: Update MockUSDT to support forceApprove\n");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 NEXT STEPS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Option 1: Disable DEX (quick fix)");
  console.log("  - Call setOsloDex(address(0)) on referral contract");
  console.log("  - Registration will work (USDT stays in referral contract)");
  console.log("  - Re-enable DEX later after fixing forceApprove issue\n");
  
  console.log("Option 2: Fix MockUSDT (proper fix)");
  console.log("  - Deploy new MockUSDT with forceApprove support");
  console.log("  - Update referral contract to use new MockUSDT");
  console.log("  - Registration will work with DEX injection\n");
  
  console.log("Option 3: Use frontend (manual)");
  console.log("  - Import wallet to MetaMask");
  console.log("  - Register via http://localhost:3000");
  console.log("  - Same error will occur, but you can see full details\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
