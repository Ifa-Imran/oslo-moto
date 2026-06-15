import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Checking DEX State for Deposit Error\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const OSLODEX_ADDRESS = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
  const OSLO_TOKEN_ADDRESS = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
  const USDT_ADDRESS = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
  const NEW_IE_ADDRESS = "0x6522745D648019360f96E13a54C8A1D8AAc2A3Ee";

  const oslodex = await ethers.getContractAt("OSLODEX", OSLODEX_ADDRESS);
  const osloToken = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", OSLO_TOKEN_ADDRESS);
  const usdt = await ethers.getContractAt("contracts/mocks/MockUSDT.sol:MockUSDT", USDT_ADDRESS);

  // Check DEX reserves
  console.log("📊 DEX Reserves:");
  const [usdtReserve, osloReserve] = await oslodex.getReserves();
  console.log("  USDT:", ethers.formatEther(usdtReserve));
  console.log("  OSLO:", ethers.formatEther(osloReserve));
  console.log("");

  // Check DEX OSLO balance
  const dexOsloBalance = await osloToken.balanceOf(OSLODEX_ADDRESS);
  console.log("  DEX OSLO Balance:", ethers.formatEther(dexOsloBalance));
  console.log("");

  // Check InvestmentEngine OSLO balance
  const ieOsloBalance = await osloToken.balanceOf(NEW_IE_ADDRESS);
  console.log("  IE OSLO Balance:", ethers.formatEther(ieOsloBalance));
  console.log("");

  // Check if DEX is priced
  console.log("🔎 DEX Price Status:");
  try {
    const price = await oslodex.getCurrentPrice();
    console.log("  Current Price:", price.toString());
    console.log("");
  } catch (error: any) {
    console.log("  ❌ Cannot get price:", error.message);
    console.log("");
  }

  // Check IE configuration
  console.log("🔎 IE Configuration:");
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE_ADDRESS);
  
  try {
    const [deployer] = await ethers.getSigners();
    const admin = await ie.admin();
    console.log("  Admin:", admin);
    
    const treasury = await ie.treasury();
    console.log("  Treasury:", treasury);
    
    const referral = await ie.referral();
    console.log("  Referral:", referral);
    
    const rankSystem = await ie.rankSystem();
    console.log("  Rank System:", rankSystem);
    
    const osloDex = await ie.osloDex();
    console.log("  OSLO DEX:", osloDex);
    
    const timelock = await ie.timelock();
    console.log("  Timelock:", timelock);
    console.log("");
  } catch (error: any) {
    console.log("  ❌ Cannot read config:", error.message);
    console.log("");
  }

  // The error 0x0ab366de - let's check if it's DEXNotPriced
  console.log("💡 Analysis:");
  console.log("  Error selector: 0x0ab366de");
  console.log("  Most likely: DEXNotPriced() or NotConfigured()");
  console.log("");
  console.log("  If DEX has 0 USDT or 0 OSLO reserve, deposits will fail.");
  console.log("  Need to seed DEX with liquidity first.");
  console.log("");

  if (usdtReserve === 0n || osloReserve === 0n) {
    console.log("❌ DEX HAS NO LIQUIDITY!");
    console.log("💡 Need to seed DEX before deposits can work.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
