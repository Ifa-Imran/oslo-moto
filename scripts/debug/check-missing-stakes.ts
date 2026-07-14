import { ethers } from "hardhat";

/**
 * Diagnostic script: checks two wallets' stake status in both V1 and V2 engines.
 *
 * Usage:
 *   npx hardhat run scripts/debug/check-missing-stakes.ts --network bscMainnet
 */

const MISSING_WALLETS = [
  "0x9843fEc7F7c7cd2A9B813A7C0DA3A2fe623e853F",
  "0xF1693617aF489b7f2c6C33F55dC4146751259b4f",
];

const OLD_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const NEW_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const REGISTRY = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function directReferrer(address) view returns (address)",
  "function getDirectDownlines(address) view returns (address[])",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("DIAGNOSTIC: Check Missing Stakes in V1 vs V2");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BNB: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log();

  const oldEngine = new ethers.Contract(OLD_ENGINE, ENGINE_ABI, deployer);
  const newEngine = new ethers.Contract(NEW_ENGINE, ENGINE_ABI, deployer);
  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, deployer);

  // Protocol stats
  const [v1Users, v1Active, v2Users, v2Active] = await Promise.all([
    oldEngine.totalUsers(),
    oldEngine.totalActiveStakes(),
    newEngine.totalUsers(),
    newEngine.totalActiveStakes(),
  ]);

  console.log("Protocol Stats:");
  console.log(`  V1: totalUsers=${v1Users}, totalActiveStakes=${ethers.formatUnits(v1Active, 6)} USDT`);
  console.log(`  V2: totalUsers=${v2Users}, totalActiveStakes=${ethers.formatUnits(v2Active, 6)} USDT`);
  console.log();

  for (const wallet of MISSING_WALLETS) {
    const addr = `${wallet.slice(0, 10)}...${wallet.slice(-8)}`;
    console.log("=".repeat(70));
    console.log(`Wallet: ${addr}`);
    console.log("=".repeat(70));

    // Check registry
    const isReg = await registry.isRegistered(wallet);
    const referrer = isReg ? await registry.directReferrer(wallet) : ethers.ZeroAddress;
    const downlines = isReg ? await registry.getDirectDownlines(wallet) : [];
    console.log(`  Registry: ${isReg ? "REGISTERED" : "NOT REGISTERED"}`);
    if (isReg) {
      console.log(`    Referrer: ${referrer}`);
      console.log(`    Direct downlines: ${downlines.length}`);
    }
    console.log();

    // Check V1
    console.log("  --- V1 Engine (OLD) ---");
    const v1HasStaked = await oldEngine.hasStaked(wallet);
    const v1Stakes = await oldEngine.getUserStakes(wallet);
    const v1Claimed = await oldEngine.totalClaimed(wallet);
    const v1Seeded = await oldEngine.seededEarnings(wallet);
    const v1Claimable = await oldEngine.getClaimableYield(wallet);
    const v1Accrued = await oldEngine.calculateAccruedYield(wallet);
    const v1ActiveStake = await oldEngine.getTotalActiveStake(wallet);

    console.log(`    hasStaked:       ${v1HasStaked}`);
    console.log(`    stakes count:    ${v1Stakes.length}`);
    console.log(`    activeStake:     ${ethers.formatUnits(v1ActiveStake, 6)} USDT`);
    console.log(`    totalClaimed:    ${ethers.formatUnits(v1Claimed, 6)} USDT`);
    console.log(`    seededEarnings:  ${ethers.formatUnits(v1Seeded, 6)} USDT`);
    console.log(`    claimableYield:  ${ethers.formatUnits(v1Claimable, 6)} USDT`);
    console.log(`    accruedYield:    ${ethers.formatUnits(v1Accrued, 6)} USDT`);

    if (v1Stakes.length > 0) {
      for (let i = 0; i < v1Stakes.length; i++) {
        const s = v1Stakes[i];
        console.log(`    Stake #${i}:`);
        console.log(`      activeStake:    ${ethers.formatUnits(s.activeStake, 6)} USDT`);
        console.log(`      totalEarnings:  ${ethers.formatUnits(s.totalEarnings, 6)} USDT`);
        console.log(`      startTime:      ${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString()})`);
        console.log(`      dayIndex:       ${s.stakeDayIndex}`);
        console.log(`      tier:           ${s.tier}`);
        console.log(`      referrer:       ${s.referrer}`);
        console.log(`      isActive:       ${s.isActive}`);
      }
    }

    console.log();

    // Check V2
    console.log("  --- V2 Engine (CURRENT) ---");
    const v2HasStaked = await newEngine.hasStaked(wallet);
    const v2Stakes = await newEngine.getUserStakes(wallet);
    const v2Claimed = await newEngine.totalClaimed(wallet);
    const v2Seeded = await newEngine.seededEarnings(wallet);
    const v2Claimable = await newEngine.getClaimableYield(wallet);
    const v2Accrued = await newEngine.calculateAccruedYield(wallet);
    const v2ActiveStake = await newEngine.getTotalActiveStake(wallet);

    console.log(`    hasStaked:       ${v2HasStaked}`);
    console.log(`    stakes count:    ${v2Stakes.length}`);
    console.log(`    activeStake:     ${ethers.formatUnits(v2ActiveStake, 6)} USDT`);
    console.log(`    totalClaimed:    ${ethers.formatUnits(v2Claimed, 6)} USDT`);
    console.log(`    seededEarnings:  ${ethers.formatUnits(v2Seeded, 6)} USDT`);
    console.log(`    claimableYield:  ${ethers.formatUnits(v2Claimable, 6)} USDT`);
    console.log(`    accruedYield:    ${ethers.formatUnits(v2Accrued, 6)} USDT`);

    if (v2Stakes.length > 0) {
      for (let i = 0; i < v2Stakes.length; i++) {
        const s = v2Stakes[i];
        console.log(`    Stake #${i}:`);
        console.log(`      activeStake:    ${ethers.formatUnits(s.activeStake, 6)} USDT`);
        console.log(`      totalEarnings:  ${ethers.formatUnits(s.totalEarnings, 6)} USDT`);
        console.log(`      startTime:      ${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString()})`);
        console.log(`      dayIndex:       ${s.stakeDayIndex}`);
        console.log(`      tier:           ${s.tier}`);
        console.log(`      referrer:       ${s.referrer}`);
        console.log(`      isActive:       ${s.isActive}`);
      }
    }

    console.log();

    // Diagnosis
    console.log("  --- DIAGNOSIS ---");
    if (v1HasStaked && !v2HasStaked) {
      console.log("  ⚠️  WALLET HAS V1 STAKES BUT MISSING IN V2!");
      console.log("  → This wallet was missed during migration (not in referral tree).");
      console.log("  → Need to seed stake into V2 using adminImportStake.");
    } else if (!v1HasStaked && !v2HasStaked) {
      console.log("  ⚠️  WALLET HAS NO STAKES IN EITHER V1 OR V2!");
      console.log("  → May have staked on an even older contract, or stake was withdrawn.");
    } else if (v2HasStaked) {
      console.log("  ✓  Wallet has stakes in V2 — no action needed.");
    }
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
