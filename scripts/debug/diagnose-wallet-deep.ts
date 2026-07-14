import { ethers } from "hardhat";

/**
 * Deep diagnostic for wallet 0x76B3Cf7b52Ec938063f0aEe6798498532B2E4964
 * Checks referral tree position, direct stakes on V1, and on-chain events.
 */

const WALLET = "0x76B3Cf7b52Ec938063f0aEe6798498532B2E4964";

const V1_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";
const V2_ENGINE = "0xa94C1D69A6c55712225C673F74e55E0A02D5dec0";
const V21_ENGINE = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const REGISTRY_ADDR = "0x8fb493d566caDE4F24475918277887E85A6506ed";

const REGISTRY_ABI = [
  "function directReferrer(address) view returns (address)",
  "function isRegistered(address) view returns (bool)",
  "function getDirectDownlines(address) view returns (address[])",
  "function getDirectDownlineCount(address) view returns (uint256)",
  "function uplineAtLevel(address,uint256) view returns (address)",
];

const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
];

async function main() {
  const provider = ethers.provider;
  console.log(`Deep diagnostic for: ${WALLET}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // ===== 1. Referral Registry =====
  console.log("===== REFERRAL REGISTRY =====");
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);

  const referrer = await registry.directReferrer(WALLET);
  console.log(`  directReferrer: ${referrer}`);
  
  if (referrer === ethers.ZeroAddress) {
    console.log("  -> NOT REGISTERED (directReferrer == 0x0)");
  } else if (referrer === "0x0000000000000000000000000000000000000001") {
    console.log("  -> Self-registered with NO referrer (sentinel address(1))");
    console.log("  -> This wallet is ORPHANED in the referral tree — not reachable from any root!");
  } else {
    console.log(`  -> Referred by: ${referrer}`);
    // Check upline chain
    console.log("  Upline chain:");
    for (let i = 1; i <= 20; i++) {
      const up = await registry.uplineAtLevel(WALLET, i);
      if (up === ethers.ZeroAddress) break;
      console.log(`    Level ${i}: ${up}`);
    }
  }

  // Check downlines
  const downlines = await registry.getDirectDownlines(WALLET);
  console.log(`  Direct downlines: ${downlines.length}`);
  if (downlines.length > 0) {
    for (const d of downlines) {
      console.log(`    ${d}`);
    }
  }

  // ===== 2. V1 Engine — query getUserStakes directly (bypass hasStaked) =====
  console.log("\n===== V1 ENGINE (direct stake query) =====");
  const v1 = new ethers.Contract(V1_ENGINE, ENGINE_ABI, provider);
  
  const v1HasStaked = await v1.hasStaked(WALLET);
  console.log(`  hasStaked: ${v1HasStaked}`);
  
  try {
    const v1Stakes = await v1.getUserStakes(WALLET);
    console.log(`  getUserStakes returned: ${v1Stakes.length} stakes`);
    if (v1Stakes.length > 0) {
      for (let i = 0; i < v1Stakes.length; i++) {
        const s = v1Stakes[i];
        console.log(`    [${i}] active=${s.isActive} tier=${s.tier} stake=${ethers.formatUnits(s.activeStake, 18)} USDT`);
        console.log(`        totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)} startTime=${s.stakeStartTime}`);
      }
    }
  } catch (e: any) {
    console.log(`  getUserStakes ERROR: ${e.message?.substring(0, 200)}`);
  }

  try {
    const v1Claimed = await v1.totalClaimed(WALLET);
    console.log(`  totalClaimed: ${ethers.formatUnits(v1Claimed, 18)}`);
  } catch (e: any) {
    console.log(`  totalClaimed ERROR: ${e.message?.substring(0, 100)}`);
  }

  try {
    const v1Seeded = await v1.seededEarnings(WALLET);
    console.log(`  seededEarnings: ${ethers.formatUnits(v1Seeded, 18)}`);
  } catch (e: any) {
    console.log(`  seededEarnings ERROR: ${e.message?.substring(0, 100)}`);
  }

  // ===== 3. V2 Engine — same direct query =====
  console.log("\n===== V2 ENGINE (direct stake query) =====");
  const v2 = new ethers.Contract(V2_ENGINE, ENGINE_ABI, provider);
  
  const v2HasStaked = await v2.hasStaked(WALLET);
  console.log(`  hasStaked: ${v2HasStaked}`);
  
  try {
    const v2Stakes = await v2.getUserStakes(WALLET);
    console.log(`  getUserStakes returned: ${v2Stakes.length} stakes`);
    if (v2Stakes.length > 0) {
      for (let i = 0; i < v2Stakes.length; i++) {
        const s = v2Stakes[i];
        console.log(`    [${i}] active=${s.isActive} tier=${s.tier} stake=${ethers.formatUnits(s.activeStake, 18)} USDT`);
      }
    }
  } catch (e: any) {
    console.log(`  getUserStakes ERROR: ${e.message?.substring(0, 200)}`);
  }

  // ===== 4. V2.1 Engine — same direct query =====
  console.log("\n===== V2.1 ENGINE (direct stake query) =====");
  const v21 = new ethers.Contract(V21_ENGINE, ENGINE_ABI, provider);
  
  const v21HasStaked = await v21.hasStaked(WALLET);
  console.log(`  hasStaked: ${v21HasStaked}`);
  
  try {
    const v21Stakes = await v21.getUserStakes(WALLET);
    console.log(`  getUserStakes returned: ${v21Stakes.length} stakes`);
    if (v21Stakes.length > 0) {
      for (let i = 0; i < v21Stakes.length; i++) {
        const s = v21Stakes[i];
        console.log(`    [${i}] active=${s.isActive} tier=${s.tier} stake=${ethers.formatUnits(s.activeStake, 18)} USDT`);
      }
    }
  } catch (e: any) {
    console.log(`  getUserStakes ERROR: ${e.message?.substring(0, 200)}`);
  }

  // ===== 5. Check Staked events on V1 =====
  console.log("\n===== V1 STAKED EVENTS =====");
  try {
    const stakedFilter = v1.filters.Staked?.(WALLET) ?? {
      address: V1_ENGINE,
      topics: [
        ethers.id("Staked(address,uint256,uint8,address,uint256)"),
        ethers.zeroPadValue(WALLET, 32),
      ],
    };
    const events = await provider.getLogs({
      ...stakedFilter,
      fromBlock: 0,
      toBlock: "latest",
    });
    console.log(`  Found ${events.length} Staked events on V1`);
    for (const e of events) {
      console.log(`    Block ${e.blockNumber} tx: ${e.transactionHash}`);
      if (e.data && e.data.length >= 10) {
        console.log(`    Data: ${e.data.substring(0, 200)}`);
      }
    }
  } catch (e: any) {
    console.log(`  Event query error: ${e.message?.substring(0, 200)}`);
  }

  // ===== 6. Check ALL events from V1 involving this wallet =====
  console.log("\n===== ALL V1 EVENTS FOR THIS WALLET =====");
  try {
    const paddedWallet = ethers.zeroPadValue(WALLET, 32);
    const events = await provider.getLogs({
      address: V1_ENGINE,
      topics: [null, paddedWallet], // Any event with this wallet as first indexed param
      fromBlock: 0,
      toBlock: "latest",
    });
    console.log(`  Found ${events.length} total events on V1 with this wallet as indexed param`);
    for (const e of events) {
      const sig = e.topics[0]?.substring(0, 10);
      console.log(`    Block ${e.blockNumber} sig=${sig} tx: ${e.transactionHash}`);
    }
  } catch (e: any) {
    console.log(`  Event query error: ${e.message?.substring(0, 200)}`);
  }

  // ===== 7. Check transactions to V1 from this wallet =====
  console.log("\n===== TRANSACTIONS TO V1 FROM THIS WALLET =====");
  try {
    // Check Staked event (first indexed param is user)
    const paddedWallet = ethers.zeroPadValue(WALLET, 32);
    
    // Also check if wallet appears as msg.sender in any event (not just indexed)
    // We'll check all logs from V1 where this wallet is in topics
    const allV1Events = await provider.getLogs({
      address: V1_ENGINE,
      topics: [null, paddedWallet],
      fromBlock: 0,
      toBlock: "latest",
    });
    
    // Also check topics[2], topics[3] (referrer field)
    const asReferrer = await provider.getLogs({
      address: V1_ENGINE,
      topics: [null, null, paddedWallet],
      fromBlock: 0,
      toBlock: "latest",
    });
    
    console.log(`  As user (topics[1]): ${allV1Events.length} events`);
    console.log(`  As referrer (topics[2]): ${asReferrer.length} events`);
    
    // Also check registry events
    const regEvents = await provider.getLogs({
      address: REGISTRY_ADDR,
      topics: [null, paddedWallet],
      fromBlock: 0,
      toBlock: "latest",
    });
    console.log(`  Registry events (as user): ${regEvents.length} events`);
    for (const e of regEvents) {
      const sig = e.topics[0]?.substring(0, 10);
      console.log(`    Block ${e.blockNumber} sig=${sig} tx: ${e.transactionHash}`);
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message?.substring(0, 200)}`);
  }

  console.log("\n===== DIAGNOSIS COMPLETE =====");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
