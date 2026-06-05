import { ethers } from "hardhat";

const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Seed Referral OSLO ===");

  const erc20 = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];

  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  // Check balances
  const deployerBal = await oslo.balanceOf(deployer.address);
  const vaultBal = await oslo.balanceOf(VAULT);
  const referralBal = await oslo.balanceOf(REFERRAL);

  console.log("OSLO Balances:");
  console.log("  Deployer: %s", ethers.formatEther(deployerBal));
  console.log("  Vault:    %s", ethers.formatEther(vaultBal));
  console.log("  Referral: %s", ethers.formatEther(referralBal));

  // Calculate OSLO needed for 57.50 USDT commissions
  // At DEX price: ~10 OSLO/USDT → ~0.1 OSLO per 1 USDT
  // 57.50 USDT * 0.1 = ~5.75 OSLO. Round up to 20 OSLO for buffer.
  const needed = ethers.parseEther("20"); // 20 OSLO — covers existing + buffer

  if (referralBal >= needed) {
    console.log("\n✓ Referral already has enough OSLO");
    return;
  }

  // Use deployer if they have enough, otherwise try vault
  if (deployerBal >= needed) {
    console.log("\nSending %s OSLO from deployer → Referral", ethers.formatEther(needed));
    const tx = await oslo.transfer(REFERRAL, needed);
    console.log("  Tx: %s", tx.hash);
    await tx.wait();
    console.log("  ✓ Sent!");
  } else if (vaultBal >= needed) {
    console.log("\n✗ Deployer has insufficient OSLO. Vault has %s but no transfer function.", ethers.formatEther(vaultBal));
    console.log("  Manual fix: deployer needs OSLO first, or Vault admin needs to add transfer function.");
    return;
  } else {
    console.log("\n✗ Neither deployer nor Vault has enough OSLO");
    return;
  }

  // Verify
  const newBal = await oslo.balanceOf(REFERRAL);
  console.log("  New Referral balance: %s OSLO", ethers.formatEther(newBal));
}

main().catch(console.error);
