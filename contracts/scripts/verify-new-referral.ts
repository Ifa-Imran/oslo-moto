import { ethers } from "hardhat";

/**
 * Verify that both Vault.claimRewards() and Referral.claimReferralRewards()
 * now work correctly with the new Referral contract.
 */

const USER = "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8";
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const NEW_REFERRAL = "0xCF3F7B63b952Bef316308642494c51EBD8Cc59C8";
const DEX_V3 = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

async function main() {
  const provider = ethers.provider;

  console.log("═══ Verifying claim functions via eth_call ═══\n");

  // 1. Test Vault.claimRewards() via eth_call with from: USER
  const vaultIface = new ethers.Interface([
    "function claimRewards()",
    "function getPendingRewards(address) view returns (uint256)",
  ]);

  const pending = await provider.call({
    to: VAULT,
    data: vaultIface.encodeFunctionData("getPendingRewards", [USER]),
  });
  const pendingAmount = vaultIface.decodeFunctionResult("getPendingRewards", pending)[0];
  console.log("Pending vault rewards:", ethers.formatEther(pendingAmount), "USDT");

  console.log("\nSimulating vault.claimRewards() from USER...");
  try {
    const result = await provider.call({
      to: VAULT,
      data: vaultIface.encodeFunctionData("claimRewards"),
      from: USER,
    });
    console.log("✅ vault.claimRewards() SUCCESS! Return data:", result);
  } catch (e: any) {
    console.log("❌ vault.claimRewards() REVERTED:", e.message?.slice(0, 200));
  }

  // 2. Test Referral.claimReferralRewards() via eth_call with from: USER
  const refIface = new ethers.Interface([
    "function claimReferralRewards()",
    "function referralRewards(address) view returns (uint256)",
  ]);

  const refRewards = await provider.call({
    to: NEW_REFERRAL,
    data: refIface.encodeFunctionData("referralRewards", [USER]),
  });
  const refRewardsAmount = refIface.decodeFunctionResult("referralRewards", refRewards)[0];
  console.log("\nPending referral rewards:", ethers.formatEther(refRewardsAmount), "USDT");

  // Check DEX price for conversion
  const dexIface = new ethers.Interface([
    "function getUSDTForOSLOOutput(uint256) view returns (uint256)",
  ]);
  const osloOut = await provider.call({
    to: DEX_V3,
    data: dexIface.encodeFunctionData("getUSDTForOSLOOutput", [refRewardsAmount]),
  });
  const osloOutAmount = dexIface.decodeFunctionResult("getUSDTForOSLOOutput", osloOut)[0];
  console.log("Would receive:", ethers.formatEther(osloOutAmount), "OSLO");

  // Check Referral OSLO balance
  const erc20Iface = new ethers.Interface([
    "function balanceOf(address) view returns (uint256)",
  ]);
  const refBal = await provider.call({
    to: OSLO_TOKEN,
    data: erc20Iface.encodeFunctionData("balanceOf", [NEW_REFERRAL]),
  });
  const refBalance = erc20Iface.decodeFunctionResult("balanceOf", refBal)[0];
  console.log("New Referral OSLO balance:", ethers.formatEther(refBalance));

  console.log("\nSimulating referral.claimReferralRewards() from USER...");
  try {
    const result = await provider.call({
      to: NEW_REFERRAL,
      data: refIface.encodeFunctionData("claimReferralRewards"),
      from: USER,
    });
    console.log("✅ referral.claimReferralRewards() SUCCESS! Return data:", result);
  } catch (e: any) {
    console.log("❌ referral.claimReferralRewards() REVERTED:", e.message?.slice(0, 200));
  }

  console.log("\n═══ Verification Complete ═══");
}

main().catch(console.error);
