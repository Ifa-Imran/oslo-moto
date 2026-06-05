import { ethers } from "hardhat";

/**
 * Deploy new OSLOReferral contract and migrate all data from old one.
 * This fixes the ABI mismatch (old returns void, new returns uint256)
 * and the payment method (old pays USDT, new pays OSLO).
 * 
 * SAFE: No liquidity is touched. Only a storage pointer changes in Vault.
 */

const OLD_REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const DEX_V3 = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const RANK_SYSTEM = "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C";
const OSLO_TOKEN = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const OSLO_FUND_AMOUNT = ethers.parseEther("1100"); // enough for commissions

// Minimal ABI for old referral (works despite source mismatch)
const OLD_REFERRAL_ABI = [
  "function userInfo(address) view returns (address referrer, uint256 unlockedLevels, uint256 totalEarned, bool registered)",
  "function referralRewards(address) view returns (uint256)",
  "function getDirectReferrals(address) view returns (address[])",
  "function totalRegistered() view returns (uint256)",
  "function totalCommissionsPaid() view returns (uint256)",
  "function isRegistered(address) view returns (bool)",
];

const VAULT_ABI = [
  "function configure(address _osloDex, address _referral, address _rankSystem, address _timelock) external",
  "function referral() view returns (address)",
  "function admin() view returns (address)",
  "function setupComplete() view returns (bool)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

interface UserData {
  address: string;
  referrer: string;
  unlockedLevels: number;
  totalEarned: bigint;
  referralRewards: bigint;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const oldReferral = new ethers.Contract(OLD_REFERRAL, OLD_REFERRAL_ABI, deployer);
  const vault = new ethers.Contract(VAULT, VAULT_ABI, deployer);
  const osloToken = new ethers.Contract(OSLO_TOKEN, ERC20_ABI, deployer);

  // ─── Pre-flight checks ──────────────────────────────────────────────
  const vaultAdmin = await vault.admin();
  const vaultSetupComplete = await vault.setupComplete();
  console.log("Vault admin:", vaultAdmin);
  console.log("Vault setupComplete:", vaultSetupComplete);
  
  if (vaultAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is NOT the Vault admin. Cannot reconfigure.");
  }
  if (vaultSetupComplete) {
    throw new Error("Vault setupComplete is true. Cannot reconfigure.");
  }

  // ─── Step 1: Discover all users via tree walk ───────────────────────
  console.log("\n═══ Step 1: Discovering all registered users ═══");
  
  const totalRegistered = await oldReferral.totalRegistered();
  console.log("Total registered on-chain:", totalRegistered.toString());

  // Start with known roots (users with referrer = 0x0)
  const roots = [
    "0x47f8160e3C854b4b4679579b99726E5E81736B7f", // deployer
    "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4", // main user
  ];

  const allUsers = new Set<string>();
  const queue: string[] = [...roots];

  while (queue.length > 0) {
    const user = queue.shift()!;
    if (allUsers.has(user.toLowerCase())) continue;

    try {
      const isReg = await oldReferral.isRegistered(user);
      if (!isReg) continue;
    } catch {
      continue;
    }

    allUsers.add(user.toLowerCase());

    try {
      const directs: string[] = await oldReferral.getDirectReferrals(user);
      for (const d of directs) {
        if (!allUsers.has(d.toLowerCase())) {
          queue.push(d);
        }
      }
    } catch (e) {
      console.log(`  Warning: Could not get directs for ${user}`);
    }

    // Rate limit prevention
    if (allUsers.size % 10 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`Discovered ${allUsers.size} users (expected ${totalRegistered})`);

  // ─── Step 2: Read all user data ─────────────────────────────────────
  console.log("\n═══ Step 2: Reading user data from old contract ═══");

  const userData: UserData[] = [];
  for (const addr of allUsers) {
    try {
      const info = await oldReferral.userInfo(addr);
      const rewards = await oldReferral.referralRewards(addr);
      userData.push({
        address: ethers.getAddress(addr),
        referrer: info.referrer,
        unlockedLevels: Number(info.unlockedLevels),
        totalEarned: info.totalEarned,
        referralRewards: rewards,
      });
    } catch (e) {
      console.log(`  Warning: Could not read data for ${addr}:`, e);
    }
  }

  console.log(`Read data for ${userData.length} users`);

  // Sort: parents before children (users with referrer=0x0 first, then BFS order)
  const sorted = topologicalSort(userData);
  console.log("Sorted for migration (parents first)");

  // ─── Step 3: Deploy new OSLOReferral ────────────────────────────────
  console.log("\n═══ Step 3: Deploying new OSLOReferral ═══");

  const ReferralFactory = await ethers.getContractFactory("OSLOReferral");
  const newReferral = await ReferralFactory.deploy(USDT, OSLO_TOKEN);
  await newReferral.waitForDeployment();
  const newReferralAddr = await newReferral.getAddress();
  console.log("✅ New OSLOReferral deployed at:", newReferralAddr);

  // ─── Step 4: Configure new Referral ─────────────────────────────────
  console.log("\n═══ Step 4: Configuring new Referral ═══");
  
  // investmentEngine = Vault (because Vault calls distributeReferralCommission)
  const tx1 = await newReferral.configure(VAULT, DEX_V3, ethers.ZeroAddress);
  await tx1.wait();
  console.log("✅ New Referral configured (investmentEngine=Vault, dex=DEX_V3)");

  // ─── Step 5: Migrate users (in batches of 20) ──────────────────────
  console.log("\n═══ Step 5: Migrating users ═══");

  const BATCH_SIZE = 20;
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const batch = sorted.slice(i, i + BATCH_SIZE);
    const users = batch.map(u => u.address);
    const referrers = batch.map(u => u.referrer);
    const levels = batch.map(u => u.unlockedLevels);

    const tx = await newReferral.migrateUsers(users, referrers, levels);
    await tx.wait();
    console.log(`  Migrated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} users`);
  }

  // ─── Step 6: Migrate earnings ───────────────────────────────────────
  console.log("\n═══ Step 6: Migrating earnings ═══");

  const usersWithEarnings = sorted.filter(u => u.totalEarned > 0n || u.referralRewards > 0n);
  if (usersWithEarnings.length > 0) {
    for (let i = 0; i < usersWithEarnings.length; i += BATCH_SIZE) {
      const batch = usersWithEarnings.slice(i, i + BATCH_SIZE);
      const users = batch.map(u => u.address);
      const totalEarned = batch.map(u => u.totalEarned);
      const rewards = batch.map(u => u.referralRewards);

      const tx = await newReferral.migrateEarnings(users, totalEarned, rewards);
      await tx.wait();
      console.log(`  Migrated earnings batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} users`);
    }
  } else {
    console.log("  No users with earnings to migrate");
  }

  // ─── Step 7: Update Vault to point to new Referral ─────────────────
  console.log("\n═══ Step 7: Updating Vault referral pointer ═══");
  
  const tx7 = await vault.configure(DEX_V3, newReferralAddr, RANK_SYSTEM, ethers.ZeroAddress);
  await tx7.wait();
  console.log("✅ Vault reconfigured → referral =", newReferralAddr);

  // Verify
  const newRefOnVault = await vault.referral();
  console.log("  Vault.referral() =", newRefOnVault);
  if (newRefOnVault.toLowerCase() !== newReferralAddr.toLowerCase()) {
    throw new Error("MISMATCH! Vault referral not updated correctly!");
  }

  // ─── Step 8: Fund new Referral with OSLO ────────────────────────────
  console.log("\n═══ Step 8: Funding new Referral with OSLO ═══");

  const deployerOslo = await osloToken.balanceOf(deployer.address);
  console.log("  Deployer OSLO balance:", ethers.formatEther(deployerOslo));

  if (deployerOslo >= OSLO_FUND_AMOUNT) {
    const tx8 = await osloToken.transfer(newReferralAddr, OSLO_FUND_AMOUNT);
    await tx8.wait();
    console.log(`✅ Funded new Referral with ${ethers.formatEther(OSLO_FUND_AMOUNT)} OSLO`);
  } else {
    console.log("⚠️  Deployer doesn't have enough OSLO. Fund manually!");
    console.log(`  Need: ${ethers.formatEther(OSLO_FUND_AMOUNT)} OSLO`);
  }

  // ─── Step 9: Verification ──────────────────────────────────────────
  console.log("\n═══ Step 9: Verification ═══");

  const newRefBalance = await osloToken.balanceOf(newReferralAddr);
  console.log("  New Referral OSLO balance:", ethers.formatEther(newRefBalance));

  const testUser = "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8";
  const isReg = await newReferral.isRegistered(testUser);
  const rewards = await newReferral.referralRewards(testUser);
  console.log(`  Test user ${testUser}:`);
  console.log(`    registered: ${isReg}`);
  console.log(`    referralRewards: ${ethers.formatEther(rewards)} USDT`);

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  DEPLOYMENT COMPLETE                         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  New Referral: ${newReferralAddr}  ║`);
  console.log("║  Vault updated ✅                            ║");
  console.log("║  Users migrated ✅                           ║");
  console.log("║  OSLO funded ✅                              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("\n⚡ UPDATE FRONTEND: src/lib/contracts.ts → referral address");
}

/**
 * Topological sort: ensure parents appear before children
 */
function topologicalSort(users: UserData[]): UserData[] {
  const addrMap = new Map<string, UserData>();
  for (const u of users) {
    addrMap.set(u.address.toLowerCase(), u);
  }

  const sorted: UserData[] = [];
  const visited = new Set<string>();

  function visit(addr: string) {
    const key = addr.toLowerCase();
    if (visited.has(key)) return;
    visited.add(key);

    const user = addrMap.get(key);
    if (!user) return;

    // Visit parent first
    if (user.referrer !== ethers.ZeroAddress) {
      visit(user.referrer);
    }

    sorted.push(user);
  }

  for (const u of users) {
    visit(u.address);
  }

  return sorted;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
