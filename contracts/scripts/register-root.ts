import { ethers } from "hardhat";

const USDT_ADDRESS = "0xdFAff6C92d9d4e0935cAF3429e80C821A044161c";
const REFERRAL_ADDRESS = "0x57e7317f6ff98881fdc54604bf64DA274478B157";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Registering root referral with account:", deployer.address);

  const usdt = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDRESS);

  // Approve referral contract to spend 1 USDT for registration fee
  const fee = ethers.parseEther("1");
  console.log("Approving 1 USDT for referral contract...");
  let tx = await usdt.approve(REFERRAL_ADDRESS, fee);
  await tx.wait();
  console.log("USDT approved");

  // Register deployer as root referral
  console.log("Registering root referral...");
  tx = await referral.register(deployer.address, ethers.ZeroAddress);
  await tx.wait();
  console.log("Root referral registered successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
