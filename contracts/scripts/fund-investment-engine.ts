import { ethers } from "hardhat";

/**
 * Fund the InvestmentEngine contract with OSLO tokens
 * so that yield claims can be fulfilled.
 *
 * Usage: npx hardhat run scripts/fund-investment-engine.ts --network bscMainnet
 */

const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const INVESTMENT_ENGINE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const oslo = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"],
    OSLO_TOKEN,
    deployer
  );

  const decimals = await oslo.decimals();
  const symbol = await oslo.symbol();

  // Check balances
  const deployerBal = await oslo.balanceOf(deployer.address);
  const engineBal = await oslo.balanceOf(INVESTMENT_ENGINE);

  console.log(`\n${symbol} Token: ${OSLO_TOKEN}`);
  console.log(`InvestmentEngine: ${INVESTMENT_ENGINE}`);
  console.log(`\nDeployer ${symbol} balance: ${ethers.formatUnits(deployerBal, decimals)}`);
  console.log(`InvestmentEngine ${symbol} balance: ${ethers.formatUnits(engineBal, decimals)}`);

  // Transfer amount — adjust as needed
  // Send 100,000 OSLO to start (enough for many claims)
  const AMOUNT = ethers.parseUnits("100000", decimals);

  if (deployerBal < AMOUNT) {
    console.log(`\n⚠️  Deployer only has ${ethers.formatUnits(deployerBal, decimals)} ${symbol}`);
    console.log(`   Cannot send ${ethers.formatUnits(AMOUNT, decimals)} ${symbol}`);
    // Send whatever is available (keep 1000 for gas buffer)
    const buffer = ethers.parseUnits("1000", decimals);
    if (deployerBal > buffer) {
      const sendAmount = deployerBal - buffer;
      console.log(`   Sending available: ${ethers.formatUnits(sendAmount, decimals)} ${symbol}`);
      const tx = await oslo.transfer(INVESTMENT_ENGINE, sendAmount);
      console.log(`   TX: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ Done!`);
    } else {
      console.log(`   ❌ Not enough OSLO to fund. Need to mint or acquire more.`);
    }
    return;
  }

  console.log(`\nSending ${ethers.formatUnits(AMOUNT, decimals)} ${symbol} to InvestmentEngine...`);
  const tx = await oslo.transfer(INVESTMENT_ENGINE, AMOUNT);
  console.log(`TX: ${tx.hash}`);
  await tx.wait();

  const newBal = await oslo.balanceOf(INVESTMENT_ENGINE);
  console.log(`\n✅ InvestmentEngine new ${symbol} balance: ${ethers.formatUnits(newBal, decimals)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
