import { ethers } from "hardhat";

/**
 * Diagnoses a specific wallet across V1, V2, and V2.1 contracts.
 *
 * Usage: npx hardhat run scripts/debug/diagnose-wallet.ts --network bscMainnet
 */

const WALLET = "0x44bDCeD43d2d974f64f058aaF68Bebd0Bea21f69";

const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";
const V1_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const V2_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
];

const V2_EXTRA_ABI = [
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
];

const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function directReferrer(address) view returns (address)",
  "function getDirectDownlines(address) view returns (address[])",
];

async function checkContract(name: string, addr: string, provider: any, isV2: boolean = false) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${name} (${addr})`);
  console.log("=".repeat(60));

  const abi = isV2 ? [...ENGINE_ABI, ...V2_EXTRA_ABI] : ENGINE_ABI;
  const engine = new ethers.Contract(addr, abi, provider);

  try {
    const hasStaked = await engine.hasStaked(WALLET);
    console.log(`  hasStaked: ${hasStaked}`);

    if (!hasStaked) {
      console.log("  -> No stakes in this contract");
      return;
    }

    const stakes = await engine.getUserStakes(WALLET);
    const claimed = await engine.totalClaimed(WALLET);
    const claimable = await engine.getClaimableYield(WALLET);
    const accrued = await engine.calculateAccruedYield(WALLET);
    const activeStake = await engine.getTotalActiveStake(WALLET);

    console.log(`  Total active stake: ${ethers.formatUnits(activeStake, 18)} USDT`);
    console.log(`  Total claimed:      ${ethers.formatUnits(claimed, 18)} USDT`);
    if (isV2) {
      try {
        const seeded = await engine.seededEarnings(WALLET);
        const external = await engine.externalEarnings(WALLET);
        console.log(`  Seeded earnings:    ${ethers.formatUnits(seeded, 18)} USDT`);
        console.log(`  External earnings:  ${ethers.formatUnits(external, 18)} USDT`);
      } catch {}
    }
    console.log(`  Accrued yield:      ${ethers.formatUnits(accrued, 18)} USDT`);
    console.log(`  Claimable yield:    ${ethers.formatUnits(claimable, 18)} USDT`);
    console.log(`  Stakes (${stakes.length}):`);

    for (let i = 0; i < stakes.length; i++) {
      const s = stakes[i];
      console.log(`    [${i}] active=${s.isActive} tier=${s.tier} stake=${ethers.formatUnits(s.activeStake, 18)} USDT`);
      console.log(`        totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)} startTime=${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString().substring(0, 19)}) dayIndex=${s.stakeDayIndex}`);
      console.log(`        referrer=${s.referrer}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.substring(0, 100)}`);
  }
}

async function main() {
  const provider = ethers.provider;
  console.log(`Diagnosing wallet: ${WALLET}`);
  console.log(`Time: ${new Date().toISOString()}`);

    // Check referral registry
  console.log("\n--- Referral Registry ---");
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);
  try {
    const isRegistered = await registry.isRegistered(WALLET);
    console.log(`  Registered: ${isRegistered}`);
    if (isRegistered) {
      const referrer = await registry.directReferrer(WALLET);
      console.log(`  Referrer: ${referrer}`);
      const downlines = await registry.getDirectDownlines(WALLET);
      console.log(`  Direct downlines: ${downlines.length}`);
      if (downlines.length > 0) {
        console.log(`    ${downlines.slice(0, 5).join(", ")}${downlines.length > 5 ? "..." : ""}`);
      }
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.substring(0, 100)}`);
  }

  // Check all contracts
  await checkContract("OLD Engine (pre-V1)", OLD_ENGINE, provider, false);
  await checkContract("V1 Engine (original)", V1_ENGINE, provider, false);
  await checkContract("V2 Engine (first migration)", V2_ENGINE, provider, true);
  await checkContract("V2.1 Engine (current, active)", V21_ENGINE, provider, true);

  console.log("\n" + "=".repeat(60));
  console.log("DIAGNOSIS COMPLETE");
  console.log("=".repeat(60));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
