import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Fix script: Grant missing ENGINE_ROLE on LeadershipBonus + LevelIncomeSystem,
 * then re-seed all 104 users from backup.
 *
 * The main deployment script (redeploy-engine-fix.ts) already deployed:
 *   InvestmentEngine: 0xDb18Ee516677A68284a76A5969138805670A1fD1
 *   OsloDAO:          0xC63066cA1b0C2F5c8678fea77168f604B2D2109c
 * But forgot to grant ENGINE_ROLE to the new engine on existing LB + LevelSystem.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/fix-roles-reseed.ts --network bscMainnet
 */

const NEW_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const LEVEL_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const LB_ADDR = "0xE05c36e61B81E34d7063627280dE8a9c4CD96e64";
const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("FIX ROLES + RESEED with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

  const roleABI = [
    "function grantRole(bytes32, address) external",
    "function revokeRole(bytes32, address) external",
    "function hasRole(bytes32, address) view returns (bool)",
  ];

  // =====================================================
  // STEP 1: Grant ENGINE_ROLE to new engine on LB + LevelSystem
  // =====================================================
  console.log("\n========== STEP 1: GRANT ENGINE_ROLE ==========");

  const lbC = new ethers.Contract(LB_ADDR, roleABI, deployer);
  const levelC = new ethers.Contract(LEVEL_ADDR, roleABI, deployer);

  // Check if new engine already has ENGINE_ROLE on LB
  const hasRoleLB = await lbC.hasRole(ENGINE_ROLE, NEW_ENGINE);
  if (!hasRoleLB) {
    console.log("   Granting ENGINE_ROLE → new engine on LeadershipBonus...");
    await lbC.grantRole(ENGINE_ROLE, NEW_ENGINE);
    console.log("   Done.");
  } else {
    console.log("   New engine already has ENGINE_ROLE on LeadershipBonus");
  }

  // Check if new engine already has ENGINE_ROLE on LevelSystem
  const hasRoleLevel = await levelC.hasRole(ENGINE_ROLE, NEW_ENGINE);
  if (!hasRoleLevel) {
    console.log("   Granting ENGINE_ROLE → new engine on LevelIncomeSystem...");
    await levelC.grantRole(ENGINE_ROLE, NEW_ENGINE);
    console.log("   Done.");
  } else {
    console.log("   New engine already has ENGINE_ROLE on LevelIncomeSystem");
  }

  // Revoke old engine's ENGINE_ROLE on LB + Level (cleanup)
  const oldHasRoleLB = await lbC.hasRole(ENGINE_ROLE, OLD_ENGINE);
  if (oldHasRoleLB) {
    console.log("   Revoking old engine ENGINE_ROLE on LeadershipBonus...");
    await lbC.revokeRole(ENGINE_ROLE, OLD_ENGINE);
  }
  const oldHasRoleLevel = await levelC.hasRole(ENGINE_ROLE, OLD_ENGINE);
  if (oldHasRoleLevel) {
    console.log("   Revoking old engine ENGINE_ROLE on LevelIncomeSystem...");
    await levelC.revokeRole(ENGINE_ROLE, OLD_ENGINE);
  }
  console.log("   Role cleanup done.");

  // =====================================================
  // STEP 2: RE-SEED ALL USERS FROM BACKUP
  // =====================================================
  console.log("\n========== STEP 2: RE-SEED STAKES ==========");

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`   Backup: ${backup._meta.totalUsers} users, ${backup._meta.withActiveDeposit} with deposits`);

  const usersWithDeposits = backup.users.filter((u: any) => {
    const cur = parseFloat(u.investmentEngine?.activeDeposit || "0");
    return cur > 0;
  });
  console.log(`   Users with deposits: ${usersWithDeposits.length}`);

  const engineABI = [
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function adminSeedClaimed(address, uint256) external",
    "function adminSetSeededEarnings(address, uint256) external",
    "function totalUsers() view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
    "function totalProtocolTurnover() view returns (uint256)",
    "function getClaimableYield(address) view returns (uint256)",
    "function calculateAccruedYield(address) view returns (uint256)",
    "function seededEarnings(address) view returns (uint256)",
  ];
  const engineC = new ethers.Contract(NEW_ENGINE, engineABI, deployer);

  let totalSeeded = 0;
  let totalAmount = 0n;
  let skipped = 0;
  let totalEarningsSeeded = 0n;

  for (const user of usersWithDeposits) {
    const currentDeposit = parseFloat(user.investmentEngine?.activeDeposit || "0");
    if (currentDeposit <= 0) { skipped++; continue; }

    const amount = ethers.parseUnits(currentDeposit.toString(), 18);
    const tier = currentDeposit >= 2500 ? 2 : 1;
    const earnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    const earningsAmount = ethers.parseUnits(earnings.toString(), 18);

    try {
      // adminSeedStake: sets totalEarnings=0, seededEarnings[user]+=earnings
      const tx = await engineC.adminSeedStake(user.address, amount, tier, earningsAmount);
      await tx.wait();
      totalSeeded++;
      totalAmount += amount;
      totalEarningsSeeded += earningsAmount;

      // Also seed totalClaimed for display purposes
      if (earnings > 0) {
        const tx2 = await engineC.adminSeedClaimed(user.address, earningsAmount);
        await tx2.wait();
      }

      if (totalSeeded % 10 === 0) {
        console.log(`   Progress: ${totalSeeded}/${usersWithDeposits.length} seeded...`);
      }
    } catch (e: any) {
      if (e.message.includes("insufficient funds")) {
        console.log(`   OUT OF BNB! Stopped at user ${totalSeeded + 1}/${usersWithDeposits.length}`);
        break;
      }
      console.log(`   WARN: Failed to seed stake for ${user.address.substring(0, 12)}...: ${e.message.substring(0, 120)}`);
      skipped++;
    }
  }

  console.log(`\n   Seeded ${totalSeeded} stakes, skipped ${skipped}`);
  console.log(`   Total staked: ${ethers.formatUnits(totalAmount, 18)} USDT`);
  console.log(`   Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 18)} USDT`);

  // =====================================================
  // STEP 3: VERIFY
  // =====================================================
  console.log("\n========== STEP 3: VERIFY ==========");
  const totalUsers = await engineC.totalUsers();
  const totalActive = await engineC.totalActiveStakes();
  const totalTurnover = await engineC.totalProtocolTurnover();
  console.log(`   totalUsers: ${totalUsers}`);
  console.log(`   totalActiveStakes: ${ethers.formatUnits(totalActive, 18)} USDT`);
  console.log(`   totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // Check a few users' claimable yield
  console.log("\n   --- Sample user checks ---");
  for (let i = 0; i < Math.min(3, usersWithDeposits.length); i++) {
    const user = usersWithDeposits[i];
    const claimable = await engineC.getClaimableYield(user.address);
    const accrued = await engineC.calculateAccruedYield(user.address);
    const seeded = await engineC.seededEarnings(user.address);
    console.log(`   ${user.address.substring(0, 12)}...: accrued=${ethers.formatUnits(accrued, 18)}, claimable=${ethers.formatUnits(claimable, 18)}, seededEarnings=${ethers.formatUnits(seeded, 18)}`);
  }

  console.log("\n========================================");
  console.log("FIX ROLES + RESEED COMPLETE");
  console.log("========================================");
  console.log(`InvestmentEngine: ${NEW_ENGINE}`);
  console.log(`Seeded: ${totalSeeded} stakes`);
  console.log(`Total staked: ${ethers.formatUnits(totalAmount, 18)} USDT`);
  console.log(`Total earnings seeded: ${ethers.formatUnits(totalEarningsSeeded, 18)} USDT`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
