import { ethers } from "hardhat";

async function main() {
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa");
  console.log("IE osloDex:", await ie.osloDex());
}

main().catch(console.error);
