import { ethers } from "hardhat";

async function main() {
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const USER = ethers.getAddress("0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8");

  const usdt = await ethers.getContractAt("IERC20", USDT);
  const oslo = await ethers.getContractAt("IERC20", OSLO_TOKEN);

  console.log("=== USDT Balances (BSC USDT uses 'BEP20:' error prefix) ===");
  console.log("Referral USDT:", ethers.formatUnits(await usdt.balanceOf(REFERRAL), 18));
  console.log("Vault USDT:", ethers.formatUnits(await usdt.balanceOf(VAULT), 18));
  console.log("User USDT:", ethers.formatUnits(await usdt.balanceOf(USER), 18));
  console.log("\nReferral OSLO:", ethers.formatUnits(await oslo.balanceOf(REFERRAL), 18));
  console.log("Vault OSLO:", ethers.formatUnits(await oslo.balanceOf(VAULT), 18));

  // Theory: The deployed Referral contract tries to transfer USDT (not OSLO)
  // Let's check by looking at the deployed bytecode's storage layout
  // The Referral's claimReferralRewards might use usdt.safeTransfer instead of osloToken.safeTransfer
  
  // Check what token the referral contract is actually trying to transfer
  // by looking for all token addresses stored in the contract
  const refAbi = [
    "function osloToken() view returns (address)",
    "function usdt() view returns (address)",
    "function osloDex() view returns (address)",
    "function referralRewards(address) view returns (uint256)"
  ];
  const ref = new ethers.Contract(REFERRAL, refAbi, ethers.provider);
  
  console.log("\n=== Referral Token Addresses ===");
  try {
    const refOslo = await ref.osloToken();
    console.log("Referral.osloToken:", refOslo);
  } catch (e: any) {
    console.log("Referral.osloToken: N/A -", e.message?.substring(0, 50));
  }
  
  try {
    const refUsdt = await ref.usdt();
    console.log("Referral.usdt:", refUsdt);
  } catch (e: any) {
    console.log("Referral.usdt: N/A -", e.message?.substring(0, 50));
  }

  // Check the user's reward amount vs Referral USDT balance
  const rewards = await ref.referralRewards(USER);
  console.log("\nUser referral rewards:", ethers.formatUnits(rewards, 18), "USDT");
  console.log("Referral USDT balance:", ethers.formatUnits(await usdt.balanceOf(REFERRAL), 18));
  console.log("CONCLUSION: If deployed contract pays in USDT directly,");
  console.log("  needs", ethers.formatUnits(rewards, 18), "USDT but has", ethers.formatUnits(await usdt.balanceOf(REFERRAL), 18));
  console.log("  → Would fail with 'BEP20: transfer amount exceeds balance'!");

  // For the Vault claim, check what fails
  // Vault.claimRewards() eventually calls osloToken.safeTransfer
  // But also calls referral.distributeReferralCommission which notifyLevelIncome
  // Then does osloToken.safeTransfer(referral, osloForCommission)
  // If Vault is correctly sending OSLO, then the Vault claim error `0x` might be from
  // the distributeReferralCommission call failing
  
  // Let's check: does the VAULT's claimRewards also try to call something on Referral
  // that transfers USDT?
  console.log("\n=== Vault Claim Flow Analysis ===");
  console.log("Vault.claimRewards() flow:");
  console.log("  1. osloToken.safeTransfer(user, osloAmount) - OSLO from Vault (3.59M) ✓");
  console.log("  2. referral.distributeReferralCommission(user, pendingUSDT)");
  console.log("     → Accrues rewards, calls notifyLevelIncome back to Vault");
  console.log("  3. osloToken.safeTransfer(referral, osloForCommission) - OSLO to Referral ✓");
  console.log("");
  console.log("  If step 2 fails, entire vault claim reverts with empty data");
  console.log("  distributeReferralCommission only updates storage + emits events + calls notifyLevelIncome");
  console.log("  notifyLevelIncome just does: userPools[user].totalCombinedEarnings += amount");
  console.log("  → Should NOT cause BEP20 error");
  
  // Actually the vault claim returned 0x (empty revert) which is different
  // Let's check if maybe the DEX.getPrice() or something inside the vault reverts
  const dexAbi = ["function getPrice() view returns (uint256)"];
  const dex = new ethers.Contract("0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D", dexAbi, ethers.provider);
  const price = await dex.getPrice();
  console.log("\nDEX price:", ethers.formatUnits(price, 18));
  console.log("DEX price > 0:", price > 0n);

  // For vault claim, maybe the issue is the OSLO token's _update function
  // Wait - Vault IS whitelisted, so tax check should pass
  // Unless the transfer goes through some other code path
  
  // Let me simulate a direct OSLO transfer from Vault to User
  console.log("\n=== Simulate direct OSLO transfer ===");
  const transferCalldata = oslo.interface.encodeFunctionData("transfer", [USER, ethers.parseUnits("1", 18)]);
  try {
    await ethers.provider.call({
      to: OSLO_TOKEN,
      data: transferCalldata,
      from: VAULT,
    });
    console.log("Direct OSLO transfer from Vault to User: SUCCESS");
  } catch (e: any) {
    console.log("Direct OSLO transfer from Vault to User: FAILED -", e.message?.substring(0, 200));
  }

  // Simulate direct OSLO transfer from Referral to User
  const transferCalldata2 = oslo.interface.encodeFunctionData("transfer", [USER, ethers.parseUnits("0.264", 18)]);
  try {
    await ethers.provider.call({
      to: OSLO_TOKEN,
      data: transferCalldata2,
      from: REFERRAL,
    });
    console.log("Direct OSLO transfer from Referral to User: SUCCESS");
  } catch (e: any) {
    console.log("Direct OSLO transfer from Referral to User: FAILED -", e.message?.substring(0, 200));
  }
}

main().catch(console.error);
