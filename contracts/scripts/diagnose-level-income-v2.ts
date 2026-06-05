import { ethers } from "hardhat";

// V3 Mainnet addresses
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Level Income Diagnosis (Deposit Flow) ===\n");

  // ─── 1. Verify cross-contract pointers ───
  const vaultAbi = [
    "function referral() view returns (address)",
    "function osloDex() view returns (address)",
    "function investmentEngine() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function getPendingRewards(address) view returns (uint256)",
    "function getActiveDeposit(address) view returns (uint256)",
    "function userPools(address) view returns (tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))",
  ];
  const refAbi = [
    "function investmentEngine() view returns (address)",
    "function osloDex() view returns (address)",
    "function setupComplete() view returns (bool)",
    "function getReferrer(address) view returns (address)",
    "function getUnlockedLevels(address) view returns (uint256)",
    "function getDirectReferrals(address) view returns (address[])",
    "function referralRewards(address) view returns (uint256)",
    "function levelIncome(address,uint256) view returns (uint256)",
    "function userInfo(address) view returns (tuple(address,uint256,uint256,bool))",
    "function totalRegistered() view returns (uint256)",
    "function getQualifiedDirectsCount(address) view returns (uint256)",
  ];

  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);

  console.log("1. Cross-Contract Pointers:");
  console.log("   Vault.referral        = %s", await vault.referral());
  console.log("   Vault.osloDex         = %s", await vault.osloDex());
  console.log("   Referral.investmentEngine = %s", await ref.investmentEngine());
  console.log("   Referral.osloDex      = %s", await ref.osloDex());
  console.log("   Vault.setupComplete   = %s", await vault.setupComplete());
  console.log("   Referral.setupComplete = %s", await ref.setupComplete());

  // ─── 2. Check deposit flow: does Vault call distributeReferralCommission on deposit? ───
  console.log("\n2. Deposit Flow Analysis:");
  console.log("   Vault.deposit() calls:");
  console.log("     - Referral.checkAndUnlockLevels(depositor)       ✓ level unlock");
  console.log("     - Referral.checkAndUnlockLevels(referrer)         ✓ level unlock");
  console.log("     - Referral.getReferrer(depositor)                 ✓ read referrer");
  console.log("   Vault.deposit() does NOT call:");
  console.log("     - Referral.distributeReferralCommission()         ✗ NOT CALLED on deposit!");
  console.log("\n   ⚠ distributeReferralCommission only called during claimRewards(), not deposit().");
  console.log("   If you need commission on stake, Vault.deposit() must be modified.\n");

  // ─── 3. Verify claim flow works end-to-end ───
  console.log("3. Claim Flow (distributeReferralCommission):");
  try {
    // Check if Referral's onlyInvestmentEngine check passes when Vault calls
    const ieInRef = await ref.investmentEngine();
    console.log("   Referral.investmentEngine = %s", ieInRef);
    console.log("   Vault address             = %s", VAULT);
    if (ieInRef.toLowerCase() === VAULT.toLowerCase()) {
      console.log("   ✓ Pointer correct — Vault can call distributeReferralCommission");
    } else {
      console.log("   ✗ Pointer MISMATCH! Vault cannot call distributeReferralCommission!");
    }
  } catch (e: any) {
    console.log("   Error: %s", e.message);
  }

  // ─── 4. Check notifyLevelIncome callback ───
  console.log("\n4. notifyLevelIncome callback (Referral → Vault):");
  try {
    const vaultRef = await vault.referral();
    console.log("   Vault.referral = %s", vaultRef);
    console.log("   Referral addr  = %s", REFERRAL);
    if (vaultRef.toLowerCase() === REFERRAL.toLowerCase()) {
      console.log("   ✓ Vault.referral points to Referral → notifyLevelIncome will work");
    } else {
      console.log("   ✗ Vault.referral does NOT point to Referral!");
    }
  } catch (e: any) {
    console.log("   Error: %s", e.message);
  }

  // ─── 5. Sample user check ───
  console.log("\n5. Sample Referral State:");
  console.log("   Total registered: %s", (await ref.totalRegistered()).toString());

  // Check a few users — try deployer and root
  const users = [deployer.address];
  for (const user of users) {
    try {
      const info = await ref.userInfo(user);
      console.log("\n   User: %s", user);
      console.log("     registered: %s, referrer: %s, unlockedLevels: %s",
        info[3], info[0], info[1].toString());
      const rr = await ref.referralRewards(user);
      console.log("     pendingReferralRewards(USDT): %s", ethers.formatEther(rr));
      const directs = await ref.getDirectReferrals(user);
      console.log("     directReferrals: %s", directs.length);
      const qualified = await ref.getQualifiedDirectsCount(user);
      console.log("     qualifiedDirects: %s", qualified.toString());
      // Check vault balance
      try {
        const pool = await vault.userPools(user);
        console.log("     Vault: totalBalance=%s, active=%s",
          ethers.formatEther(pool[0]), pool[7]);
      } catch (e: any) {
        console.log("     Vault pool: N/A");
      }
    } catch (e: any) {
      console.log("   Error for %s: %s", user, e.message);
    }
  }
}

main().catch(console.error);
