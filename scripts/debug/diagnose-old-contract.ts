import { ethers } from "hardhat";

/**
 * Queries the OLD InvestmentEngine contract (pre-V1) for the wallet's stakes.
 * This is the contract the user actually staked on.
 */

const WALLET = "0x76B3Cf7b52Ec938063f0aEe6798498532B2E4964";
const OLD_ENGINE = "0xe71957104ec7aE92E20C3f5466Bc7A7DA61563Fa";

// Try the same ABI as V1/V2 — the contract might be an earlier version
const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveStakes() view returns (uint256)",
  "function totalProtocolTurnover() view returns (uint256)",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function adminWallet() view returns (address)",
  "function usdt() view returns (address)",
  "function osloToken() view returns (address)",
  "function referralRegistry() view returns (address)",
];

async function tryCall(name: string, contract: any, fn: string, ...args: any[]) {
  try {
    const result = await contract[fn](...args);
    if (typeof result === "bigint") {
      console.log(`  ${name}: ${ethers.formatUnits(result, 18)}`);
    } else {
      console.log(`  ${name}: ${result}`);
    }
    return result;
  } catch (e: any) {
    console.log(`  ${name}: ERROR — ${e.message?.substring(0, 100)}`);
    return null;
  }
}

async function main() {
  const provider = ethers.provider;
  console.log(`Querying OLD contract: ${OLD_ENGINE}`);
  console.log(`For wallet: ${WALLET}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const engine = new ethers.Contract(OLD_ENGINE, ENGINE_ABI, provider);

  // Contract-level info
  console.log("===== CONTRACT INFO =====");
  await tryCall("totalUsers", engine, "totalUsers");
  await tryCall("totalActiveStakes", engine, "totalActiveStakes");
  await tryCall("totalProtocolTurnover", engine, "totalProtocolTurnover");
  await tryCall("paused", engine, "paused");
  await tryCall("adminWallet", engine, "adminWallet");
  await tryCall("usdt", engine, "usdt");
  await tryCall("osloToken", engine, "osloToken");
  await tryCall("referralRegistry", engine, "referralRegistry");

  // Wallet-specific info
  console.log("\n===== WALLET STATE =====");
  const hasStaked = await tryCall("hasStaked", engine, "hasStaked", WALLET);
  
  try {
    const stakes = await engine.getUserStakes(WALLET);
    console.log(`  getUserStakes: ${stakes.length} stakes`);
    let totalActive = 0n;
    for (let i = 0; i < stakes.length; i++) {
      const s = stakes[i];
      const active = BigInt(s.activeStake);
      totalActive += active;
      console.log(`    [${i}] active=${s.isActive} tier=${s.tier} stake=${ethers.formatUnits(active, 18)} USDT`);
      console.log(`        totalEarnings=${ethers.formatUnits(s.totalEarnings, 18)}`);
      console.log(`        stakeStartTime=${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString()})`);
      console.log(`        stakeDayIndex=${s.stakeDayIndex} referrer=${s.referrer}`);
    }
    console.log(`  Total active stake: ${ethers.formatUnits(totalActive, 18)} USDT`);
  } catch (e: any) {
    console.log(`  getUserStakes ERROR: ${e.message?.substring(0, 200)}`);
    console.log("  (Contract ABI may differ — trying alternative function signatures...");
  }

  await tryCall("totalClaimed", engine, "totalClaimed", WALLET);
  await tryCall("seededEarnings", engine, "seededEarnings", WALLET);
  await tryCall("externalEarnings", engine, "externalEarnings", WALLET);
  await tryCall("getClaimableYield", engine, "getClaimableYield", WALLET);
  await tryCall("calculateAccruedYield", engine, "calculateAccruedYield", WALLET);
  await tryCall("getTotalActiveStake", engine, "getTotalActiveStake", WALLET);

  // Also check Staked events from this contract for this wallet
  console.log("\n===== STAKED EVENTS ON OLD CONTRACT =====");
  try {
    const paddedWallet = ethers.zeroPadValue(WALLET, 32);
    const stakedTopic = ethers.id("Staked(address,uint256,uint8,address,uint256)");
    const events = await provider.getLogs({
      address: OLD_ENGINE,
      topics: [stakedTopic, paddedWallet],
      fromBlock: 105860000,
      toBlock: 105880000,
    });
    console.log(`  Found ${events.length} Staked events`);
    for (const e of events) {
      console.log(`    Block ${e.blockNumber} tx: ${e.transactionHash}`);
      // Decode the non-indexed params (amount, tier, referrer, timestamp)
      if (e.data.length >= 322) { // 3 * 32 bytes + 2 bytes offset = at least 3 words
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["uint256", "uint8", "address", "uint256"],
          e.data
        );
        console.log(`      amount=${ethers.formatUnits(decoded[0], 18)} USDT`);
        console.log(`      tier=${decoded[1]}`);
        console.log(`      referrer=${decoded[2]}`);
        console.log(`      timestamp=${decoded[3]} (${new Date(Number(decoded[3]) * 1000).toISOString()})`);
      }
    }
  } catch (e: any) {
    console.log(`  Event query error: ${e.message?.substring(0, 200)}`);
  }

  console.log("\n===== DONE =====");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
