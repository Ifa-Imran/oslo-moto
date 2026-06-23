import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Verify that all data from the backup was seeded to the new contracts.
 */

const BACKUP_FILE = "mainnet-full-backup-2026-06-18T06-17-33-231Z.json";

// New contract addresses
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";
const ENGINE_ADDR = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Verifying seeding with account:", deployer.address);

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  console.log(`Backup: ${backup.users.length} users, ${backup._meta.withActiveDeposit} with deposits\n`);

  // ABIs
  const registryABI = [
    "function directReferrer(address) view returns (address)",
    "function isRegistered(address) view returns (bool)",
    "function getDirectDownlineCount(address) view returns (uint256)",
  ];
  const engineABI = [
    "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
    "function totalClaimed(address) view returns (uint256)",
    "function totalUsers() view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
    "function totalProtocolTurnover() view returns (uint256)",
  ];

  const registry = new ethers.Contract(REGISTRY_ADDR, registryABI, deployer);
  const engine = new ethers.Contract(ENGINE_ADDR, engineABI, deployer);

  // Check global stats
  const totalUsers = await engine.totalUsers();
  const totalActive = await engine.totalActiveStakes();
  const totalTurnover = await engine.totalProtocolTurnover();
  console.log("=== Global Stats ===");
  console.log(`totalUsers: ${totalUsers}`);
  console.log(`totalActiveStakes: ${ethers.formatUnits(totalActive, 18)} USDT`);
  console.log(`totalProtocolTurnover: ${ethers.formatUnits(totalTurnover, 18)} USDT`);

  // Check each user
  let registeredCount = 0;
  let unregisteredUsers = [];
  let stakedCount = 0;
  let missingStakes = [];
  let totalOnChainDeposits = 0n;
  let totalOnChainEarnings = 0n;

  console.log("\n=== Checking Each User ===");
  for (const user of backup.users) {
    const addr = user.address;
    const expectedDeposit = parseFloat(user.investmentEngine?.activeDeposit || "0");
    const expectedEarnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");

    // Check registration
    const isReg = await registry.isRegistered(addr);
    if (isReg) {
      registeredCount++;
    } else {
      unregisteredUsers.push({ address: addr, deposit: expectedDeposit });
    }

    // Check stakes
    if (expectedDeposit > 0) {
      try {
        const stakes = await engine.getUserStakes(addr);
        if (stakes.length > 0) {
          stakedCount++;
          const onChainAmount = stakes.reduce((sum: bigint, s: any) => sum + s.activeStake, 0n);
          totalOnChainDeposits += onChainAmount;
          
          // Check if amount matches
          const expectedAmount = ethers.parseUnits(expectedDeposit.toString(), 18);
          if (onChainAmount !== expectedAmount) {
            console.log(`  MISMATCH: ${addr}`);
            console.log(`    Expected: ${expectedDeposit} USDT (${expectedAmount})`);
            console.log(`    On-chain: ${ethers.formatUnits(onChainAmount, 18)} USDT (${onChainAmount})`);
          }

          // Check earnings
          const onChainEarnings = stakes.reduce((sum: bigint, s: any) => sum + s.totalEarnings, 0n);
          totalOnChainEarnings += onChainEarnings;
          const expectedEarn = ethers.parseUnits(expectedEarnings.toString(), 18);
          if (onChainEarnings !== expectedEarn) {
            console.log(`  EARNINGS MISMATCH: ${addr}`);
            console.log(`    Expected: ${expectedEarnings} (${expectedEarn})`);
            console.log(`    On-chain: ${ethers.formatUnits(onChainEarnings, 18)} (${onChainEarnings})`);
          }
        } else {
          missingStakes.push({ address: addr, deposit: expectedDeposit });
        }
      } catch (e: any) {
        console.log(`  ERROR checking stakes for ${addr}: ${e.message?.substring(0, 100)}`);
        missingStakes.push({ address: addr, deposit: expectedDeposit });
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Registered: ${registeredCount}/${backup.users.length}`);
  console.log(`Unregistered: ${unregisteredUsers.length}`);
  console.log(`Staked: ${stakedCount}/${backup._meta.withActiveDeposit}`);
  console.log(`Missing stakes: ${missingStakes.length}`);
  console.log(`Total on-chain deposits: ${ethers.formatUnits(totalOnChainDeposits, 18)} USDT`);
  console.log(`Total on-chain earnings: ${ethers.formatUnits(totalOnChainEarnings, 18)} USDT`);

  if (unregisteredUsers.length > 0) {
    console.log("\n=== Unregistered Users ===");
    unregisteredUsers.forEach(u => console.log(`  ${u.address} (deposit: $${u.deposit})`));
  }

  if (missingStakes.length > 0) {
    console.log("\n=== Missing Stakes ===");
    missingStakes.forEach(u => console.log(`  ${u.address} (deposit: $${u.deposit})`));
  }

  // Also check totalClaimed for users with earnings
  console.log("\n=== Checking totalClaimed ===");
  let missingClaimed = [];
  for (const user of backup.users) {
    const expectedEarnings = parseFloat(user.investmentEngine?.combinedEarnings || "0");
    if (expectedEarnings > 0) {
      const onChainClaimed = await engine.totalClaimed(user.address);
      const expectedClaimed = ethers.parseUnits(expectedEarnings.toString(), 18);
      if (onChainClaimed !== expectedClaimed) {
        missingClaimed.push({
          address: user.address,
          expected: expectedEarnings,
          onChain: ethers.formatUnits(onChainClaimed, 18),
        });
      }
    }
  }
  if (missingClaimed.length > 0) {
    console.log(`  ${missingClaimed.length} users with mismatched totalClaimed:`);
    missingClaimed.slice(0, 10).forEach(u => 
      console.log(`  ${u.address}: expected=${u.expected}, onChain=${u.onChain}`)
    );
    if (missingClaimed.length > 10) console.log(`  ... and ${missingClaimed.length - 10} more`);
  } else {
    console.log("  All totalClaimed values match!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
