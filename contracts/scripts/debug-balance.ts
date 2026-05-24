import { ethers } from "hardhat";

const USDT = "0x45EB9427827a2Cc1C1ed666810165703DA6edB73";
const USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";
const DEPLOYER = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

async function main() {
  const usdt = await ethers.getContractAt("MockUSDT", USDT);

  const depRaw = await usdt.balanceOf(DEPLOYER);
  const userRaw = await usdt.balanceOf(USER);
  
  console.log("Deployer raw balance:", depRaw.toString());
  console.log("Deployer formatted:", ethers.formatEther(depRaw));
  console.log("User raw balance:", userRaw.toString());
  console.log("User formatted:", ethers.formatEther(userRaw));

  // Try to mint directly to user
  if (userRaw === 0n) {
    console.log("\nMinting 20K USDT to user...");
    const tx = await usdt.mint(USER, ethers.parseEther("20000"));
    await tx.wait();
    console.log("Tx hash:", tx.hash);
    
    const afterRaw = await usdt.balanceOf(USER);
    console.log("User raw after mint:", afterRaw.toString());
    console.log("User formatted after:", ethers.formatEther(afterRaw));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
