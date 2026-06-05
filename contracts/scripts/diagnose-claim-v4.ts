import { ethers } from "hardhat";

async function main() {
  const USER = ethers.getAddress("0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8");
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";

  // Check what OSLO token address the Referral contract uses
  const refAbi = [
    "function osloToken() view returns (address)",
    "function osloDex() view returns (address)",
    "function investmentEngine() view returns (address)",
    "function referralRewards(address) view returns (uint256)",
    "function claimReferralRewards() external"
  ];
  const referral = new ethers.Contract(REFERRAL, refAbi, ethers.provider);

  console.log("=== Referral Contract Configuration ===");
  const refOsloToken = await referral.osloToken();
  const refOsloDex = await referral.osloDex();
  const refIE = await referral.investmentEngine();
  console.log("Referral.osloToken:", refOsloToken);
  console.log("Expected OSLO:     ", OSLO_TOKEN);
  console.log("Match:", refOsloToken.toLowerCase() === OSLO_TOKEN.toLowerCase());
  console.log("Referral.osloDex:", refOsloDex);
  console.log("Referral.investmentEngine:", refIE);

  // Check OSLO balance of Referral using the token address in the contract
  const osloTokenContract = await ethers.getContractAt("IERC20", refOsloToken);
  const referralBalance = await osloTokenContract.balanceOf(REFERRAL);
  console.log("\nOSLO balance of Referral (using Referral's osloToken):", ethers.formatUnits(referralBalance, 18));

  // Check the DEX getUSDTForOSLOOutput from the Referral's DEX
  const dexAbi = [
    "function getUSDTForOSLOOutput(uint256) view returns (uint256)",
    "function usdtReserve() view returns (uint256)",
    "function osloReserve() view returns (uint256)",
    "function getPrice() view returns (uint256)"
  ];
  const dex = new ethers.Contract(refOsloDex, dexAbi, ethers.provider);
  
  const rewards = await referral.referralRewards(USER);
  console.log("\nUser referral rewards:", ethers.formatUnits(rewards, 18), "USDT");
  
  try {
    const osloAmount = await dex.getUSDTForOSLOOutput(rewards);
    console.log("OSLO needed for claim:", ethers.formatUnits(osloAmount, 18));
    console.log("Referral OSLO balance:", ethers.formatUnits(referralBalance, 18));
    console.log("Sufficient?", referralBalance >= osloAmount);
  } catch (e: any) {
    console.log("getUSDTForOSLOOutput ERROR:", e.message?.substring(0, 200));
  }

  // Now simulate the actual transaction using eth_call with override
  console.log("\n=== Simulating claimReferralRewards via eth_call ===");
  const iface = new ethers.Interface(refAbi);
  const calldata = iface.encodeFunctionData("claimReferralRewards", []);
  
  try {
    const result = await ethers.provider.call({
      to: REFERRAL,
      data: calldata,
      from: USER,
    });
    console.log("Static call SUCCESS, result:", result);
  } catch (e: any) {
    console.log("Static call REVERTED:");
    console.log("  Message:", e.message?.substring(0, 300));
    
    // Try to decode the error
    const revertData = e.data || "";
    if (revertData.startsWith("0x08c379a0")) {
      // Standard Error(string)
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          "0x" + revertData.substring(10)
        );
        console.log("  Decoded revert reason:", decoded[0]);
      } catch {}
    } else if (revertData.length >= 10) {
      console.log("  Error selector:", revertData.substring(0, 10));
    }
  }

  // Also simulate vault.claimRewards
  console.log("\n=== Simulating vault.claimRewards via eth_call ===");
  const vaultAbi = ["function claimRewards() external"];
  const vaultIface = new ethers.Interface(vaultAbi);
  const vaultCalldata = vaultIface.encodeFunctionData("claimRewards", []);
  
  try {
    const result = await ethers.provider.call({
      to: VAULT,
      data: vaultCalldata,
      from: USER,
    });
    console.log("Static call SUCCESS, result:", result);
  } catch (e: any) {
    console.log("Static call REVERTED:");
    console.log("  Message:", e.message?.substring(0, 300));
    
    const revertData = e.data || "";
    if (revertData.startsWith("0x08c379a0")) {
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          "0x" + revertData.substring(10)
        );
        console.log("  Decoded revert reason:", decoded[0]);
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
      };
      console.log("  Error selector:", selector);
      console.log("  Decoded:", knownErrors[selector] || "Unknown");
    }
  }
}

main().catch(console.error);
