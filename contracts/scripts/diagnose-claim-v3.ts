import { ethers } from "hardhat";

async function main() {
  const USER = ethers.getAddress("0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8");
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
  const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";

  console.log("=== Diagnosing claim error for", USER, "===\n");

  // 1. Check Vault state for user
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  const osloToken = await ethers.getContractAt("IERC20", OSLO_TOKEN);
  const usdt = await ethers.getContractAt("IERC20", USDT);

  console.log("─── 1. VAULT USER POOL ───");
  try {
    const pool = await vault.getUserPool(USER);
    console.log("  totalBalance:", ethers.formatUnits(pool[0], 18), "USDT");
    console.log("  lastClaimTime:", pool[1].toString(), pool[1] > 0n ? `(${new Date(Number(pool[1]) * 1000).toISOString()})` : "");
    console.log("  accruedRewards:", ethers.formatUnits(pool[2], 18), "USDT");
    console.log("  totalClaimed:", ethers.formatUnits(pool[3], 18), "USDT");
    console.log("  maxReturn:", ethers.formatUnits(pool[4], 18), "USDT");
    console.log("  totalCombinedEarnings:", ethers.formatUnits(pool[5], 18), "USDT");
    console.log("  lastDepositTime:", pool[6].toString(), pool[6] > 0n ? `(${new Date(Number(pool[6]) * 1000).toISOString()})` : "");
    console.log("  active:", pool[7]);
  } catch (e: any) {
    console.log("  ERROR:", e.message?.substring(0, 150));
  }

  // 2. Check pending rewards from Vault
  console.log("\n─── 2. VAULT PENDING REWARDS ───");
  try {
    const pending = await vault.getPendingRewards(USER);
    console.log("  getPendingRewards:", ethers.formatUnits(pending, 18), "USDT");
  } catch (e: any) {
    console.log("  ERROR:", e.message?.substring(0, 150));
  }

  // 3. Check Referral rewards
  console.log("\n─── 3. REFERRAL STATE ───");
  const referralAbi = [
    "function referralRewards(address) view returns (uint256)",
    "function getReferrer(address) view returns (address)",
    "function isRegistered(address) view returns (bool)",
    "function getUnlockedLevels(address) view returns (uint256)",
    "function claimReferralRewards() external",
    "function investmentEngine() view returns (address)",
    "function osloDex() view returns (address)"
  ];
  const referral = new ethers.Contract(REFERRAL, referralAbi, ethers.provider);
  try {
    const rewards = await referral.referralRewards(USER);
    const referrer = await referral.getReferrer(USER);
    const registered = await referral.isRegistered(USER);
    const levels = await referral.getUnlockedLevels(USER);
    const refIE = await referral.investmentEngine();
    const refDex = await referral.osloDex();
    console.log("  referralRewards:", ethers.formatUnits(rewards, 18), "USDT");
    console.log("  referrer:", referrer);
    console.log("  registered:", registered);
    console.log("  unlockedLevels:", levels.toString());
    console.log("  referral.investmentEngine:", refIE);
    console.log("  referral.osloDex:", refDex);
  } catch (e: any) {
    console.log("  ERROR:", e.message?.substring(0, 200));
  }

  // 4. Check DEX price and state
  console.log("\n─── 4. DEX STATE ───");
  const dexAbi = [
    "function getPrice() view returns (uint256)",
    "function getUSDTForOSLOOutput(uint256) view returns (uint256)",
    "function usdtReserve() view returns (uint256)",
    "function osloReserve() view returns (uint256)"
  ];
  const dex = new ethers.Contract(DEX, dexAbi, ethers.provider);
  try {
    const price = await dex.getPrice();
    const usdtReserve = await dex.usdtReserve();
    const osloReserve = await dex.osloReserve();
    console.log("  price:", ethers.formatUnits(price, 18), "USDT/OSLO");
    console.log("  usdtReserve:", ethers.formatUnits(usdtReserve, 18));
    console.log("  osloReserve:", ethers.formatUnits(osloReserve, 18));

    // Simulate conversion for referral rewards
    const rewards = await referral.referralRewards(USER);
    if (rewards > 0n) {
      try {
        const osloOut = await dex.getUSDTForOSLOOutput(rewards);
        console.log("  OSLO for referral claim:", ethers.formatUnits(osloOut, 18));
      } catch (e: any) {
        console.log("  getUSDTForOSLOOutput ERROR:", e.message?.substring(0, 150));
      }
    }
  } catch (e: any) {
    console.log("  ERROR:", e.message?.substring(0, 200));
  }

  // 5. Check token balances of relevant contracts
  console.log("\n─── 5. OSLO BALANCES ───");
  const vaultOslo = await osloToken.balanceOf(VAULT);
  const referralOslo = await osloToken.balanceOf(REFERRAL);
  const dexOslo = await osloToken.balanceOf(DEX);
  console.log("  Vault OSLO:", ethers.formatUnits(vaultOslo, 18));
  console.log("  Referral OSLO:", ethers.formatUnits(referralOslo, 18));
  console.log("  DEX OSLO:", ethers.formatUnits(dexOslo, 18));

  // 6. Simulate claim calls with staticCall
  console.log("\n─── 6. SIMULATE CLAIMS ───");
  
  // Simulate vault claimRewards
  console.log("\n  [A] vault.claimRewards():");
  try {
    await vault.claimRewards.staticCall({ from: USER });
    console.log("    SUCCESS (would not revert)");
  } catch (e: any) {
    const errData = e.data || e.info?.error?.data || "";
    console.log("    REVERTED:", e.message?.substring(0, 200));
    console.log("    Error data:", errData);
    // Try to decode custom error
    if (errData && errData.length >= 10) {
      const selector = errData.substring(0, 10);
      const knownErrors: Record<string, string> = {
        "0xc2caa2a6": "NoBalance()",
        "0x20dc7257": "PoolInactive()",
        "0x5a70f3d6": "NothingToClaim()",
        "0xf7d2a67e": "BelowWithdrawalThreshold()",
        "0x90b8ec18": "DEXNotPriced()",
        "0x2c5a7399": "InsufficientOsloReserve()",
      };
      console.log("    Decoded:", knownErrors[selector] || `Unknown selector: ${selector}`);
    }
  }

  // Simulate referral claimReferralRewards
  console.log("\n  [B] referral.claimReferralRewards():");
  try {
    await referral.claimReferralRewards.staticCall({ from: USER });
    console.log("    SUCCESS (would not revert)");
  } catch (e: any) {
    const errData = e.data || e.info?.error?.data || "";
    console.log("    REVERTED:", e.message?.substring(0, 200));
    console.log("    Error data:", errData);
    if (errData && errData.length >= 10) {
      const selector = errData.substring(0, 10);
      const knownErrors: Record<string, string> = {
        "0x1f2a2005": "NothingToClaim()",
        "0xc2caa2a6": "NoBalance()",
      };
      console.log("    Decoded:", knownErrors[selector] || `Unknown selector: ${selector}`);
    }
  }

  // 7. Check what button was likely pressed
  console.log("\n─── 7. SUMMARY ───");
  const pendingRewards = await vault.getPendingRewards(USER);
  const refRewards = await referral.referralRewards(USER);
  const pendingNum = Number(pendingRewards) / 1e18;
  const refNum = Number(refRewards) / 1e18;
  console.log("  Investment Yield (pendingTotalNum):", pendingNum.toFixed(4), "USDT");
  console.log("  Level Commissions (rewardsNum):", refNum.toFixed(4), "USDT");
  console.log("  Total Earnings:", (pendingNum + refNum).toFixed(4), "USDT");
  console.log("  Claim Yield button enabled:", pendingNum >= 1);
  console.log("  Claim Commissions button enabled:", refNum >= 1);
}

main().catch(console.error);
