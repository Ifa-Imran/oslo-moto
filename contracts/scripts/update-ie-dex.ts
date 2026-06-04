import { ethers } from "hardhat";

async function main() {
  const NEW_DEX = "0x1a881a4bFD2E72c70667b8bD7bF77227a9f6Cf03";
  const IE_ADDR = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);

  console.log("Current IE osloDex:", await ie.osloDex());

  const tx = await ie.configure(
    await ie.treasury(),
    await ie.referral(),
    await ie.rankSystem(),
    NEW_DEX,
    await ie.timelock()
  );
  await tx.wait();

  console.log("New IE osloDex:", await ie.osloDex());
  console.log("✓ InvestmentEngine updated");
}

main().catch(console.error);
