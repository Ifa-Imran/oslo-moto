import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Finding OSLO Token Holders\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const OLD_IE_ADDRESS = "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC";
  const DEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const DEPLOYER = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN_ADDRESS);

  console.log("📊 Checking OSLO balances:\n");

  // Check deployer
  const deployerBalance = await osloToken.balanceOf(DEPLOYER);
  console.log("  Deployer:", DEPLOYER);
  console.log("  Balance:", ethers.formatEther(deployerBalance), "OSLO\n");

  // Check old IE
  const oldIEBalance = await osloToken.balanceOf(OLD_IE_ADDRESS);
  console.log("  Old IE:", OLD_IE_ADDRESS);
  console.log("  Balance:", ethers.formatEther(oldIEBalance), "OSLO\n");

  // Check DEX
  const dexBalance = await osloToken.balanceOf(DEX_ADDRESS);
  console.log("  DEX:", DEX_ADDRESS);
  console.log("  Balance:", ethers.formatEther(dexBalance), "OSLO\n");

  // Check total supply
  const totalSupply = await osloToken.totalSupply();
  console.log("  Total Supply:", ethers.formatEther(totalSupply), "OSLO\n");

  // Check owner
  try {
    const owner = await osloToken.owner();
    console.log("  Owner:", owner, "\n");
  } catch (e) {
    console.log("  Owner: Not Ownable (using admin pattern)\n");
  }

  // Check admin
  try {
    const admin = await osloToken.admin();
    console.log("  Admin:", admin, "\n");
  } catch (e) {
    console.log("  Admin: No admin function\n");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (oldIEBalance > ethers.parseEther("1000000")) {
    console.log("💡 SOLUTION: Old IE has OSLO reserve!");
    console.log("   We can either:");
    console.log("   1. Transfer OSLO from old IE to new IE (if old IE has admin function)");
    console.log("   2. Use old IE directly (but it has forceApprove bug)");
    console.log("   3. Skip OSLO reserve check in new IE (modify contract)");
    console.log("");
  }

  if (deployerBalance === 0n) {
    console.log("❌ Deployer has 0 OSLO - tokens were already distributed");
    console.log("   Need to find where the 11M initial supply went\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
