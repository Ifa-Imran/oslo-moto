import { ethers } from "hardhat";

/**
 * Migrates wallet 0x76B3Cf7b... from the OLD pre-V1 contract to V2.1.
 *
 * Old contract: 0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa
 * V2.1 target:  0x69C9739089DbC960e83a51C349cB7B0db69E7A80
 *
 * The wallet has 4 active stakes (500 + 1000 + 1000 + 1450 = 3950 USDT),
 * totalEarnings=0, totalClaimed=0, no seeded/external earnings.
 * Clean migration — just import the stakes with original parameters.
 *
 * Usage: npx hardhat run scripts/deploy/migrate-old-contract-wallet.ts --network bscMainnet
 */

const WALLET = "0x76B3Cf7b52Ec938063f0aEe6798498532B2E4964";
const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const OLD_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
];

const V21_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function adminImportStake(address user, uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive) external",
  "function adminSetSeededEarnings(address user, uint256 amount) external",
  "function adminSetExternalEarnings(address user, uint256 amount) external",
  "function adminSeedClaimed(address user, uint256 amount) external",
];

const REGISTRY_ABI = [
  "function directReferrer(address) view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("MIGRATE WALLET FROM OLD CONTRACT → V2.1");
  console.log("=".repeat(60));
  console.log(`Wallet:      ${WALLET}`);
  console.log(`Old engine:  ${OLD_ENGINE}`);
  console.log(`V2.1 engine: ${V21_ENGINE}`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`BNB:         ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const oldEngine = new ethers.Contract(OLD_ENGINE, OLD_ABI, deployer);
  const v21 = new ethers.Contract(V21_ENGINE, V21_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);

  // 1. Read old contract state
  console.log("\n--- READING OLD CONTRACT STATE ---");
  const oldStakes = await oldEngine.getUserStakes(WALLET);
  const oldClaimed = await oldEngine.totalClaimed(WALLET);
  const oldClaimable = await oldEngine.getClaimableYield(WALLET);
  const oldAccrued = await oldEngine.calculateAccruedYield(WALLET);
  const referrer = await registry.directReferrer(WALLET);

  console.log(`  Stakes: ${oldStakes.length}`);
  let totalActive = 0n;
  for (let i = 0; i < oldStakes.length; i++) {
    const s = oldStakes[i];
    totalActive += BigInt(s.activeStake);
    console.log(`    [${i}] ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, startTime=${s.stakeStartTime}`);
  }
  console.log(`  Total active:     ${ethers.formatUnits(totalActive, 18)} USDT`);
  console.log(`  Total claimed:    ${ethers.formatUnits(oldClaimed, 18)} USDT`);
  console.log(`  Accrued yield:    ${ethers.formatUnits(oldAccrued, 18)} USDT`);
  console.log(`  Claimable yield:  ${ethers.formatUnits(oldClaimable, 18)} USDT`);
  console.log(`  Referrer:         ${referrer}`);

  // 2. Check if already migrated
  const v21HasStaked = await v21.hasStaked(WALLET);
  if (v21HasStaked) {
    const v21Stakes = await v21.getUserStakes(WALLET);
    console.log(`\n  ⚠️  Wallet already has ${v21Stakes.length} stakes in V2.1 — skipping.`);
    return;
  }

  // 3. Pre-migration V2.1 stats
  const [beforeUsers, beforeActive, beforeTurnover] = await Promise.all([
    v21.totalUsers(),
    v21.totalActiveStakes(),
    v21.totalProtocolTurnover(),
  ]);
  console.log(`\n--- V2.1 BEFORE MIGRATION ---`);
  console.log(`  Users: ${beforeUsers}, Active: ${ethers.formatUnits(beforeActive, 18)}, Turnover: ${ethers.formatUnits(beforeTurnover, 18)}`);

  // 4. Import each stake to V2.1
  // totalEarnings = 0 for all (no claims ever made, clean migration)
  // Use the actual referrer from the registry
  console.log(`\n--- IMPORTING STAKES TO V2.1 ---`);
  for (let i = 0; i < oldStakes.length; i++) {
    const s = oldStakes[i];
    const activeStake = BigInt(s.activeStake);
    const totalEarnings = 0n; // Clean: no claims ever made
    const stakeStartTime = BigInt(s.stakeStartTime);
    const stakeDayIndex = Number(s.stakeDayIndex);
    const tier = Number(s.tier);
    const stakeReferrer = referrer !== ethers.ZeroAddress && referrer !== "0x0000000000000000000000000000000000000001"
      ? referrer
      : ethers.ZeroAddress;
    const isActive = Boolean(s.isActive);

    console.log(`  Importing stake [${i}]: ${ethers.formatUnits(activeStake, 18)} USDT, tier ${tier}, referrer ${stakeReferrer}`);
    const tx = await v21.adminImportStake(
      WALLET,
      activeStake,
      totalEarnings,
      stakeStartTime,
      stakeDayIndex,
      tier,
      stakeReferrer,
      isActive
    );
    const receipt = await tx.wait();
    console.log(`    ✓ Block ${receipt!.blockNumber}, gas ${receipt!.gasUsed}`);
  }

  // 5. No need to set seededEarnings, externalEarnings, or totalClaimed (all 0)

  // 6. Post-migration V2.1 stats
  const [afterUsers, afterActive, afterTurnover] = await Promise.all([
    v21.totalUsers(),
    v21.totalActiveStakes(),
    v21.totalProtocolTurnover(),
  ]);
  console.log(`\n--- V2.1 AFTER MIGRATION ---`);
  console.log(`  Users: ${afterUsers} (was ${beforeUsers}, +${afterUsers - beforeUsers})`);
  console.log(`  Active: ${ethers.formatUnits(afterActive, 18)} (was ${ethers.formatUnits(beforeActive, 18)}, +${ethers.formatUnits(afterActive - beforeActive, 18)})`);
  console.log(`  Turnover: ${ethers.formatUnits(afterTurnover, 18)} (was ${ethers.formatUnits(beforeTurnover, 18)}, +${ethers.formatUnits(afterTurnover - beforeTurnover, 18)})`);

  // 7. Verify wallet on V2.1
  console.log(`\n--- VERIFICATION ---`);
  const v21Stakes = await v21.getUserStakes(WALLET);
  const v21Claimable = await v21.getClaimableYield(WALLET);
  const v21Accrued = await v21.calculateAccruedYield(WALLET);
  const v21TotalActive = await v21.getTotalActiveStake(WALLET);

  console.log(`  Stakes in V2.1: ${v21Stakes.length}`);
  for (let i = 0; i < v21Stakes.length; i++) {
    const s = v21Stakes[i];
    console.log(`    [${i}] ${ethers.formatUnits(s.activeStake, 18)} USDT, tier=${s.tier}, active=${s.isActive}, totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
  }
  console.log(`  Total active stake:  ${ethers.formatUnits(v21TotalActive, 18)} USDT`);
  console.log(`  Accrued yield:       ${ethers.formatUnits(v21Accrued, 18)} USDT`);
  console.log(`  Claimable yield:     ${ethers.formatUnits(v21Claimable, 18)} USDT`);

  if (v21Claimable > 0n) {
    console.log(`\n  ✅ Wallet is now live on V2.1 with ${ethers.formatUnits(v21Claimable, 18)} USDT claimable!`);
  } else {
    console.log(`\n  ⚠️  Claimable is 0 — check for 3X cap or other issues.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(60));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
