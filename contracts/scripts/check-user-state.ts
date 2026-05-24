import { ethers } from "hardhat";

const USDT_ADDRESS = "0x604544CB446D4eEa0A4Fb948312B019215915007";
const REF_ADDRESS = "0x483C0fb12a93a766520239ff3d9f59ED991cBd61";
const IE_ADDRESS = "0xdB2d3706A6F981A5E4daf7370366B216CE460A13";

const USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  const [deployer] = await ethers.getSigners();
  const mockUSDT = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  const ref = await ethers.getContractAt("OSLOReferral", REF_ADDRESS);

  // Check user's USDT balance
  const usdtBal = await mockUSDT.balanceOf(USER);
  console.log("User USDT Balance:", ethers.formatEther(usdtBal));

  // Check USDT allowance for IE
  const allowance = await mockUSDT.allowance(USER, IE_ADDRESS);
  console.log("USDT Allowance for IE:", ethers.formatEther(allowance));

  // Check if user is registered
  const userInfo = await ref.userInfo(USER);
  console.log("User registered:", userInfo.registered);

  // Check if IE deposits are paused
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDRESS);
  const paused = await ie.depositsPaused();
  console.log("Deposits paused:", paused);

  // Check IE config
  console.log("IE osloDex:", await ie.osloDex());
  console.log("IE treasury:", await ie.treasury());
  console.log("IE referral:", await ie.referral());
  console.log("IE rankSystem:", await ie.rankSystem());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
