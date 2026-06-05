import { ethers } from "hardhat";

async function main() {
  const USER = ethers.getAddress("0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8");
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  const tokenAbi = [
    "function admin() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function liquidityManager() view returns (address)",
    "function investmentEngine() view returns (address)",
    "function timelock() view returns (address)",
    "function isTaxWhitelisted(address) view returns (bool)",
    "function isSellEndpoint(address) view returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function totalBurned() view returns (uint256)"
  ];
  const token = new ethers.Contract(OSLO_TOKEN, tokenAbi, ethers.provider);

  console.log("=== OSLO Token State ===");
  const admin = await token.admin();
  const setupComplete = await token.setupComplete();
  const lm = await token.liquidityManager();
  const ie = await token.investmentEngine();
  const tl = await token.timelock();
  console.log("admin:", admin);
  console.log("setupComplete:", setupComplete);
  console.log("liquidityManager:", lm);
  console.log("investmentEngine:", ie);
  console.log("timelock:", tl);
  console.log("totalBurned:", ethers.formatUnits(await token.totalBurned(), 18));

  console.log("\n=== Tax Whitelist Check ===");
  console.log("Vault whitelisted:", await token.isTaxWhitelisted(VAULT));
  console.log("Referral whitelisted:", await token.isTaxWhitelisted(REFERRAL));
  console.log("DEX whitelisted:", await token.isTaxWhitelisted(DEX));
  console.log("User whitelisted:", await token.isTaxWhitelisted(USER));

  console.log("\n=== Sell Endpoint Check ===");
  console.log("DEX is sell endpoint:", await token.isSellEndpoint(DEX));
  console.log("User is sell endpoint:", await token.isSellEndpoint(USER));
  console.log("Vault is sell endpoint:", await token.isSellEndpoint(VAULT));
  console.log("Referral is sell endpoint:", await token.isSellEndpoint(REFERRAL));

  console.log("\n=== OSLO Balances ===");
  console.log("Vault:", ethers.formatUnits(await token.balanceOf(VAULT), 18));
  console.log("Referral:", ethers.formatUnits(await token.balanceOf(REFERRAL), 18));
  console.log("User:", ethers.formatUnits(await token.balanceOf(USER), 18));

  // Check if maybe there's a mismatch between deployed bytecode and source
  // Try calling the referral's claimReferralRewards with trace
  console.log("\n=== Deep Debug: Check actual transfer call ===");
  
  // Let's compute what the referral would try to transfer
  const refAbi = ["function referralRewards(address) view returns (uint256)"];
  const ref = new ethers.Contract(REFERRAL, refAbi, ethers.provider);
  const rewards = await ref.referralRewards(USER);
  console.log("Referral rewards (raw):", rewards.toString());
  console.log("Referral rewards (USDT):", ethers.formatUnits(rewards, 18));

  const dexAbi = [
    "function getUSDTForOSLOOutput(uint256) view returns (uint256)",
    "function usdtReserve() view returns (uint256)",
    "function osloReserve() view returns (uint256)"
  ];
  const dex = new ethers.Contract(DEX, dexAbi, ethers.provider);
  
  const usdtRes = await dex.usdtReserve();
  const osloRes = await dex.osloReserve();
  console.log("\nDEX usdtReserve:", ethers.formatUnits(usdtRes, 18));
  console.log("DEX osloReserve:", ethers.formatUnits(osloRes, 18));
  
  // Manual calculation: (usdtAmount * osloReserve) / (usdtReserve - usdtAmount)
  const osloNeeded = (rewards * osloRes) / (usdtRes - rewards);
  console.log("Manual OSLO calc:", ethers.formatUnits(osloNeeded, 18));
  
  // Also call the function
  const osloFromDex = await dex.getUSDTForOSLOOutput(rewards);
  console.log("DEX getUSDTForOSLOOutput:", ethers.formatUnits(osloFromDex, 18));
  
  console.log("\nReferral OSLO balance:", ethers.formatUnits(await token.balanceOf(REFERRAL), 18));
  console.log("Would transfer succeed? Balance >= needed:", (await token.balanceOf(REFERRAL)) >= osloFromDex);

  // Check if maybe the issue is in the Vault's claimRewards calling distributeReferralCommission
  console.log("\n=== Check Vault -> Referral interaction ===");
  const vaultRefAbi = [
    "function referral() view returns (address)",
    "function osloDex() view returns (address)"
  ];
  const vault = new ethers.Contract(VAULT, vaultRefAbi, ethers.provider);
  console.log("Vault.referral:", await vault.referral());
  console.log("Vault.osloDex:", await vault.osloDex());
  
  // Check the onlyInvestmentEngine modifier - what address does Referral expect?
  const refIEAbi = ["function investmentEngine() view returns (address)"];
  const refForIE = new ethers.Contract(REFERRAL, refIEAbi, ethers.provider);
  const expectedIE = await refForIE.investmentEngine();
  console.log("Referral.investmentEngine (expected caller):", expectedIE);
  console.log("Vault address:", VAULT);
  console.log("Vault == Referral.investmentEngine:", expectedIE.toLowerCase() === VAULT.toLowerCase());
}

main().catch(console.error);
