import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🔑 Deploying Mock USDT with account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // Deploy Mock USDT
  console.log("🚀 Deploying MockUSDT contract...");
  const MockUSDT = await ethers.getContractFactory("contracts/mocks/MockUSDT.sol:MockUSDT");
  const mockUSDT = await MockUSDT.deploy();

  await mockUSDT.waitForDeployment();
  const mockUSDTAddress = await mockUSDT.getAddress();

  console.log("✅ MockUSDT deployed to:", mockUSDTAddress);
  console.log("\n📊 Contract Info:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🪙 Token Name:", await mockUSDT.name());
  console.log("🏷️  Symbol:", await mockUSDT.symbol());
  console.log("🔢 Decimals:", await mockUSDT.decimals());
  console.log("💵 Initial Supply:", ethers.formatUnits(await mockUSDT.totalSupply(), 18), "USDT");
  console.log("👤 Owner:", await mockUSDT.owner());
  console.log("💰 Faucet Amount:", ethers.formatUnits(await mockUSDT.FAUCET_AMOUNT(), 18), "USDT");
  console.log("⏱️  Faucet Cooldown:", Number(await mockUSDT.FAUCET_COOLDOWN()) / 3600, "hours");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Test faucet
  console.log("🧪 Testing faucet...");
  const balanceBefore = await mockUSDT.balanceOf(deployer.address);
  console.log("📊 Balance before:", ethers.formatUnits(balanceBefore, 18), "USDT");

  const tx = await mockUSDT.faucet();
  await tx.wait();

  const balanceAfter = await mockUSDT.balanceOf(deployer.address);
  console.log("📊 Balance after:", ethers.formatUnits(balanceAfter, 18), "USDT");
  console.log("✅ Faucet test successful!\n");

  console.log("🎉 Deployment Complete!");
  console.log("\n📝 Next Steps:");
  console.log("1. Update frontend .env.local with new USDT address");
  console.log("2. Update contracts data files with new address");
  console.log("3. Users can call faucet() to get 10,000 USDT for testing");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
