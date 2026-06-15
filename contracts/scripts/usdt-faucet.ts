import { ethers } from "hardhat";

// ─── Testnet USDT Contract ───────────────────────────────────────────
// USDT on BSC Testnet
const USDT_ADDRESS = "0x493769a8F24e62AEEB8aE6C2d8E24327BD41FEE3";

// ─── Minimal USDT ABI (only what we need for minting) ────────────────
const USDT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function owner() view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🔑 Faucet controlled by:", deployer.address);

  // Connect to USDT contract
  const usdt = await ethers.getContractAt(USDT_ABI, USDT_ADDRESS);

  // Check if caller is owner
  const owner = await usdt.owner();
  console.log("👑 USDT Owner:", owner);

  if (deployer.address.toLowerCase() !== owner.toLowerCase()) {
    console.error("❌ Error: Deployer is not the USDT contract owner!");
    console.error("Cannot mint USDT. Only owner can mint.");
    process.exit(1);
  }

  // Get recipient address from command line or use deployer
  const recipient = process.argv[2] || deployer.address;
  const amount = process.argv[3] || "1000"; // Default 1000 USDT

  console.log("\n💰 USDT Faucet");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📥 Recipient:", recipient);
  console.log("💵 Amount:", amount, "USDT");

  // Get decimals
  const decimals = await usdt.decimals();
  console.log("🔢 Decimals:", decimals);

  // Calculate amount with decimals
  const amountWei = ethers.parseUnits(amount, decimals);

  // Check balance before
  const balanceBefore = await usdt.balanceOf(recipient);
  console.log("📊 Balance before:", ethers.formatUnits(balanceBefore, decimals), "USDT");

  // Mint USDT
  console.log("\n⏳ Minting USDT...");
  const tx = await usdt.mint(recipient, amountWei);
  console.log("📝 Transaction hash:", tx.hash);

  // Wait for confirmation
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed! Block:", receipt.blockNumber);

  // Check balance after
  const balanceAfter = await usdt.balanceOf(recipient);
  console.log("\n📊 Balance after:", ethers.formatUnits(balanceAfter, decimals), "USDT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Successfully minted", amount, "USDT to", recipient);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
