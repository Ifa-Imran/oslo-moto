import { ethers } from "hardhat";

async function main() {
  const USER = ethers.getAddress("0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8");
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  // Simulate distributeReferralCommission call (from Vault to Referral)
  console.log("=== Simulate distributeReferralCommission ===");
  const distAbi = ["function distributeReferralCommission(address user, uint256 profitAmount) external returns (uint256)"];
  const iface = new ethers.Interface(distAbi);
  
  // Approximate pendingUSDT from the user
  const pendingUSDT = ethers.parseUnits("7.05", 18);
  const calldata = iface.encodeFunctionData("distributeReferralCommission", [USER, pendingUSDT]);
  
  try {
    const result = await ethers.provider.call({
      to: REFERRAL,
      data: calldata,
      from: VAULT, // Must be called by investmentEngine (= Vault)
    });
    console.log("distributeReferralCommission: SUCCESS");
    console.log("Result (totalDistributed):", ethers.formatUnits(ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result)[0], 18));
  } catch (e: any) {
    console.log("distributeReferralCommission: FAILED");
    console.log("  Message:", e.message?.substring(0, 300));
    const revertData = e.data || "";
    if (revertData.startsWith("0x08c379a0")) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + revertData.substring(10));
      console.log("  Decoded:", decoded[0]);
    } else if (revertData.length >= 10) {
      console.log("  Error data:", revertData.substring(0, 66));
    }
  }

  // Now simulate the FULL vault.claimRewards() from the user
  console.log("\n=== Simulate FULL vault.claimRewards() ===");
  const vaultClaimAbi = ["function claimRewards() external"];
  const vaultIface = new ethers.Interface(vaultClaimAbi);
  const claimCalldata = vaultIface.encodeFunctionData("claimRewards", []);
  
  try {
    const result = await ethers.provider.call({
      to: VAULT,
      data: claimCalldata,
      from: USER,
    });
    console.log("vault.claimRewards(): SUCCESS");
  } catch (e: any) {
    console.log("vault.claimRewards(): FAILED");
    const revertData = e.data || "";
    console.log("  Revert data length:", revertData.length);
    console.log("  Revert data:", revertData.substring(0, 200));
    if (revertData.startsWith("0x08c379a0")) {
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + revertData.substring(10));
        console.log("  Decoded reason:", decoded[0]);
      } catch {}
    } else if (revertData.length >= 10) {
      const selector = revertData.substring(0, 10);
      const knownErrors: Record<string, string> = {
        "0xc2caa2a6": "NoBalance()",
        "0x20dc7257": "PoolInactive()",
        "0x5a70f3d6": "NothingToClaim()",
        "0xf7d2a67e": "BelowWithdrawalThreshold()",
        "0x90b8ec18": "DEXNotPriced()",
        "0x2c5a7399": "InsufficientOsloReserve()",
        "0x3ee5aeb5": "ReentrancyGuardReentrantCall()",
      };
      console.log("  Error selector:", selector);
      console.log("  Decoded:", knownErrors[selector] || "Unknown - checking more...");
    } else {
      console.log("  Empty revert (0x) - could be:");
      console.log("    - assert() failure");
      console.log("    - low-level call failure");
      console.log("    - require(false) without message");
    }
    console.log("  Full message:", e.message?.substring(0, 400));
  }

  // Let's also check: does the vault call need to be whitelisted somehow?
  // Maybe the vault needs USDT approval from somewhere
  console.log("\n=== Check if Vault has USDT approval to DEX ===");
  const usdt = await ethers.getContractAt("IERC20", "0x55d398326f99059fF775485246999027B3197955");
  const vaultUSDTAllowance = await usdt.allowance(VAULT, DEX);
  console.log("Vault USDT allowance to DEX:", ethers.formatUnits(vaultUSDTAllowance, 18));

  // Check if Vault has OSLO approval for DEX  
  const oslo = await ethers.getContractAt("IERC20", OSLO_TOKEN);
  const vaultOSLOAllowance = await oslo.allowance(VAULT, DEX);
  console.log("Vault OSLO allowance to DEX:", ethers.formatUnits(vaultOSLOAllowance, 18));
}

main().catch(console.error);
