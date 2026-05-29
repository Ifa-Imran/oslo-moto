import { ethers } from "hardhat";

/**
 * Check USDT balances across all protocol contracts and fund OSLOReferral if needed.
 * 
 * The OSLOReferral contract accumulates commission amounts in referralRewards[] mapping
 * but needs actual USDT to pay them out via claimReferralRewards().
 *
 * Usage: npx hardhat run scripts/fund-referral-usdt.ts --network bscMainnet
 */

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const INVESTMENT_ENGINE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const DEX = "0xCBa239e2aE0b7d84A156399ea1791C1Dd70b5e52";
const LIQUIDITY_MANAGER = "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const usdt = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function decimals() view returns (uint8)"],
    USDT,
    deployer
  );

  const decimals = await usdt.decimals();
  console.log(`\nUSDT Decimals: ${decimals}`);

  // Check all balances
  const deployerBal = await usdt.balanceOf(deployer.address);
  const ieBal = await usdt.balanceOf(INVESTMENT_ENGINE);
  const refBal = await usdt.balanceOf(REFERRAL);
  const dexBal = await usdt.balanceOf(DEX);
  const lmBal = await usdt.balanceOf(LIQUIDITY_MANAGER);

  console.log("\n═══ USDT Balances ═══");
  console.log(`Deployer:           $${ethers.formatUnits(deployerBal, decimals)}`);
  console.log(`InvestmentEngine:   $${ethers.formatUnits(ieBal, decimals)}`);
  console.log(`OSLOReferral:       $${ethers.formatUnits(refBal, decimals)}`);
  console.log(`OSLODEX:            $${ethers.formatUnits(dexBal, decimals)}`);
  console.log(`LiquidityManager:   $${ethers.formatUnits(lmBal, decimals)}`);

  // Check total pending commissions in referral contract
  const referralContract = await ethers.getContractAt(
    ["function totalCommissionsPaid() view returns (uint256)"],
    REFERRAL,
    deployer
  );
  const totalPaid = await referralContract.totalCommissionsPaid();
  console.log(`\nTotal Commissions Accumulated: $${ethers.formatUnits(totalPaid, decimals)}`);
  console.log(`OSLOReferral USDT Balance:     $${ethers.formatUnits(refBal, decimals)}`);
  
  if (refBal < totalPaid) {
    const deficit = totalPaid - refBal;
    console.log(`\n⚠️  DEFICIT: OSLOReferral needs $${ethers.formatUnits(deficit, decimals)} more USDT`);
  }

  // Fund if deployer has USDT
  if (deployerBal > 0n && refBal === 0n) {
    // Send USDT to cover pending commissions + buffer
    const sendAmount = deployerBal < totalPaid ? deployerBal : totalPaid + ethers.parseUnits("100", decimals);
    const actualSend = sendAmount > deployerBal ? deployerBal : sendAmount;
    
    console.log(`\nSending $${ethers.formatUnits(actualSend, decimals)} USDT to OSLOReferral...`);
    const tx = await usdt.transfer(REFERRAL, actualSend);
    console.log(`TX: ${tx.hash}`);
    await tx.wait();
    
    const newBal = await usdt.balanceOf(REFERRAL);
    console.log(`✅ OSLOReferral new USDT balance: $${ethers.formatUnits(newBal, decimals)}`);
  } else if (deployerBal === 0n) {
    console.log("\n❌ Deployer has no USDT. Need to send USDT manually to OSLOReferral:");
    console.log(`   Address: ${REFERRAL}`);
  } else {
    console.log("\n✅ OSLOReferral already has USDT funds.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
