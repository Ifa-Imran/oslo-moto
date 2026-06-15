import { ethers } from "hardhat";

async function main() {
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", "0xcB406995e635C577d22b66F71fD84e748eC67488");
  console.log("IE 0xcB40 usdt:", await ie.usdt());
  console.log("IE 0xcB40 osloDex:", await ie.osloDex());
  console.log("IE 0xcB40 setupComplete:", await ie.setupComplete());

  const ie2 = await ethers.getContractAt("OSLOInvestmentEngine", "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC");
  console.log("IE 0x154B usdt:", await ie2.usdt());
  console.log("IE 0x154B osloDex:", await ie2.osloDex());
  console.log("IE 0x154B setupComplete:", await ie2.setupComplete());
}

main().catch(console.error);
