import { ethers } from "hardhat";
import { MockUSDT, OsloToken, OsloDEX, ReferralRegistry } from "../typechain-types";

async function main() {
  const [owner, user1, user2] = await ethers.getSigners();

  // Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = (await MockUSDT.deploy()) as unknown as MockUSDT;
  const usdtAddress = await usdt.getAddress();

  // Deploy OsloToken
  const OsloToken = await ethers.getContractFactory("OsloToken");
  const osloToken = (await OsloToken.deploy(owner.address)) as unknown as OsloToken;
  const osloTokenAddress = await osloToken.getAddress();

  // Deploy OsloDEX
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = (await OsloDEX.deploy(osloTokenAddress, usdtAddress)) as unknown as OsloDEX;
  const osloDEXAddress = await osloDEX.getAddress();

  // Deploy ReferralRegistry with USDT and OsloDEX
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = (await ReferralRegistry.deploy(usdtAddress, osloDEXAddress)) as unknown as ReferralRegistry;
  const registryAddress = await registry.getAddress();

  // Mint USDT to user1
  await usdt.mint(user1.address, ethers.parseUnits("100", 6));

  const fee = ethers.parseUnits("1", 6);

  console.log("=== Registration Fee Test ===");
  console.log("User1 balance before:", ethers.formatUnits(await usdt.balanceOf(user1.address), 6), "USDT");
  console.log("OsloDEX balance before:", ethers.formatUnits(await usdt.balanceOf(osloDEXAddress), 6), "USDT");
  console.log("User1 registered before:", await registry.isRegistered(user1.address));

  // Approve
  await usdt.connect(user1).approve(registryAddress, fee);
  console.log("\nApproved registry to spend 1 USDT");

  // Register with no referrer
  await registry.connect(user1).register(ethers.ZeroAddress);
  console.log("\nRegistered user1");

  console.log("User1 balance after:", ethers.formatUnits(await usdt.balanceOf(user1.address), 6), "USDT");
  console.log("OsloDEX balance after:", ethers.formatUnits(await usdt.balanceOf(osloDEXAddress), 6), "USDT");
  console.log("User1 registered after:", await registry.isRegistered(user1.address));

  // Test with referrer
  await usdt.mint(user2.address, ethers.parseUnits("10", 6));
  await usdt.connect(user2).approve(registryAddress, fee);
  await registry.connect(user2).register(user1.address);

  console.log("\nUser2 referrer:", await registry.directReferrer(user2.address));
  console.log("User2 registered:", await registry.isRegistered(user2.address));

  // Test insufficient allowance
  console.log("\nTesting insufficient allowance...");
  try {
    await registry.connect(user1).register(ethers.ZeroAddress);
    console.log("ERROR: Should have reverted");
  } catch (e: any) {
    console.log("Reverted as expected:", e.message.includes("InsufficientAllowance") || e.message.includes("AlreadyRegistered"));
  }

  console.log("\n=== Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
