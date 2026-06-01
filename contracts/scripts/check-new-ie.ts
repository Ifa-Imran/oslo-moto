import { ethers } from "hardhat";

async function main() {
  const NEW_IE = "0x3c6Ed5171E9021AE9fB94D1F077BaF7AF1e26b35";
  const OLD_IE = "0x09c56236B863FA39c2F68BD8a97f5217f89571EF";
  const DEX = "0x6e068cfd2D2878250c576aa70e1aCa64e58bEe1b";
  const OSLO = "0x69E35319980F133612f39DD56616a46b5d7b8010";
  const USDT = "0x887524926554F1e1A8Eeb3F99a0d9F6Bc9cd53dd";

  const osloToken = await ethers.getContractAt("OSLOToken", OSLO);
  const dex = await ethers.getContractAt("OSLODEX", DEX);
  const newIE = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE);

  // Check DEX reserves
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("DEX USDT reserve:", ethers.formatEther(usdtRes));
  console.log("DEX OSLO reserve:", ethers.formatEther(osloRes));

  // Check OSLO balances
  const dexOsloBal = await osloToken.balanceOf(DEX);
  console.log("DEX OSLO balance:", ethers.formatEther(dexOsloBal));
  const oldIEBal = await osloToken.balanceOf(OLD_IE);
  console.log("Old IE OSLO balance:", ethers.formatEther(oldIEBal));
  const newIEBal = await osloToken.balanceOf(NEW_IE);
  console.log("New IE OSLO balance:", ethers.formatEther(newIEBal));

  // Check DEX references
  const dexIE = await dex.investmentEngine();
  console.log("\nDEX.investmentEngine:", dexIE);
  console.log("Matches new IE?", dexIE.toLowerCase() === NEW_IE.toLowerCase());

  // Check new IE config
  const newIEReferral = await newIE.referral();
  const newIEDex = await newIE.osloDex();
  console.log("\nNew IE referral:", newIEReferral);
  console.log("New IE osloDex:", newIEDex);
  console.log("New IE setupComplete?", await newIE.setupComplete());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
