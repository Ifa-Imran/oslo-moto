import { ethers } from "hardhat";

const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";

async function main() {
  const [deployer] = await ethers.getSigners();
  const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const erc20Abi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function faucet() external"];
  const usdt = new ethers.Contract(USDT, erc20Abi, deployer);

  console.log("Testing registration with deployer:", deployer.address);
  console.log("Deployer USDT balance:", ethers.formatEther(await usdt.balanceOf(deployer.address)));
  console.log("Deployer registered?", (await ref.userInfo(deployer.address)).registered);
  console.log("Total registered:", (await ref.totalRegistered()).toString());

  // Check if deployer is already registered
  const info = await ref.userInfo(deployer.address);
  console.log("Deployer info:", { registered: info.registered, referrer: info.referrer });

  // Try a static call to simulate registration with zero address as referrer
  const testUser = "0x1234567890123456789012345678901234567890";
  console.log("\nSimulating register for test address with referrer=0x0...");
  try {
    await ref.register.staticCall(testUser, ethers.ZeroAddress);
    console.log("  SUCCESS: would not revert");
  } catch (e: any) {
    console.log("  REVERT:", e.message?.slice(0, 200));
    // Try to decode error
    if (e.data) console.log("  Error data:", e.data);
  }

  // Try with deployer as referrer
  console.log("\nSimulating register for test address with referrer=deployer...");
  try {
    await ref.register.staticCall(testUser, deployer.address);
    console.log("  SUCCESS: would not revert");
  } catch (e: any) {
    console.log("  REVERT:", e.message?.slice(0, 200));
  }

  // Approve and actually try
  console.log("\nApproving 1 USDT to Referral...");
  let tx = await usdt.approve(REFERRAL, ethers.parseEther("1"));
  await tx.wait();
  console.log("Allowance:", ethers.formatEther(await usdt.allowance(deployer.address, REFERRAL)));

  console.log("\nActually calling register(deployer, 0x0)...");
  try {
    tx = await ref.register(deployer.address, ethers.ZeroAddress);
    const receipt = await tx.wait();
    console.log("  SUCCESS! Gas used:", receipt.gasUsed.toString());
  } catch (e: any) {
    console.log("  FAILED:", e.message?.slice(0, 300));
  }
}

main().catch(console.error);