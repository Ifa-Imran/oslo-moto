import { ethers } from "hardhat";

const NEW_USDT = "0x45EB9427827a2Cc1C1ed666810165703DA6edB73";
const NEW_REFERRAL = "0xc4d2a97b84f7bBcbF21375c12fcf853377893981";
const NEW_IE = "0x5a7FBeEbcB930D2541B2CE7F26c3A824374fE5d5";
const NEW_DEX = "0x6c227f682F8D9059bb90fED700e05EEf896Bc9C2";

const USER = "0xFC7501F2f919D7c11A2451ee05575c6634669aD6";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("User:", USER);

  const usdt = await ethers.getContractAt("MockUSDT", NEW_USDT);
  const ref = await ethers.getContractAt("OSLOReferral", NEW_REFERRAL);

  // Mint USDT to user
  const userBal = await usdt.balanceOf(USER);
  console.log("User USDT balance:", ethers.formatEther(userBal));

  if (userBal < ethers.parseEther("20000")) {
    const tx = await usdt.mint(USER, ethers.parseEther("20000") - userBal);
    await tx.wait();
    console.log("Minted 20K USDT to user");
  }

  console.log("User USDT after:", ethers.formatEther(await usdt.balanceOf(USER)));

  // Register user (they may already be registered on old referral, need new one)
  const userInfo = await ref.userInfo(USER);
  console.log("User registered:", userInfo.registered);

  if (!userInfo.registered) {
    const tx = await ref.register(USER, deployer.address); // registrant: deployer as referrer
    await tx.wait();
    console.log("User registered with deployer as referrer");
  }

  // Verify DEX state
  const dex = await ethers.getContractAt("OSLODEX", NEW_DEX);
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("\nDEX Reserves:");
  console.log("  USDT:", ethers.formatEther(usdtRes));
  console.log("  OSLO:", ethers.formatEther(osloRes));
  console.log("  Price:", (Number(usdtRes) / 1e18 / (Number(osloRes) / 1e18)).toFixed(6), "USDT/OSLO");

  // Simulate deposit math
  console.log("\nDeposit simulation (10 USDT):");
  const depositAmt = ethers.parseEther("10");
  const osloOut = (depositAmt * osloRes) / (usdtRes + depositAmt);
  console.log("  OSLO from DEX:", ethers.formatEther(osloOut));
  console.log("  DEX has enough:", osloRes >= osloOut);

  // Check IE OSLO balance
  const token = await ethers.getContractAt("OSLOToken", "0x6831B62cC403E77249Da1129BF668Bd7339A001f");
  const ieOslo = await token.balanceOf(NEW_IE);
  console.log("\nIE OSLO Balance:", ethers.formatEther(ieOslo));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
