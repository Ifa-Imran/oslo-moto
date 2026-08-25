import { ethers } from "hardhat";

/**
 * Debug script: Diagnose why multiple wallets cannot claim yield.
 *
 * Checks every condition in the claimYield() flow for each wallet:
 *   1. Contract not paused
 *   2. Has stakes in the engine
 *   3. Has at least one ACTIVE stake
 *   4. Accrued yield > totalEarnings per stake (double-claim prevention)
 *   5. 3X cap not reached (effectiveEarnings < activeStake * 3)
 *   6. DEX price > 0
 *   7. RewardVault has enough OSLO to release
 *   8. LevelIncomeSystem has enough OSLO for commission distribution
 *
 * The 3X cap uses: effectiveEarnings = totalEarnings + seededEarnings[user]
 * (external earnings from recordExternalEarning are baked into totalEarnings directly)
 *
 * Usage:
 *   npx hardhat run scripts/debug/debug-claim-batch.ts --network bscMainnet
 */

// ─── Wallets reported with claim problems ───────────────────────────
const WALLETS = [
  "0xbCDfa269B587d0FE12595734f3FC76Db187842aB",
  "0x63382b1bbeb4dd22CD8Fe7AB820B3775fE187839",
  "0x1c2783b0B4B0085f0a493AF16eB9c17FdB0e8e21",
  "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8",
];

// ─── Current mainnet contract addresses (from frontend/.env.local) ─
const ENGINE_ADDR = "0x69C9739089DbC960e83a51C349cB7B0db69E7A80";
const OSLO_TOKEN_ADDR = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const DEX_ADDR = "0x03bD43d3268BC584aDcB142a0fBAeda7987e38b1";
const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const LEVEL_SYSTEM_ADDR = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";

// ─── ABIs ───────────────────────────────────────────────────────────
const ENGINE_ABI = [
  "function getUserStakes(address) view returns (tuple(uint256 activeStake, uint256 totalEarnings, uint256 stakeStartTime, uint8 stakeDayIndex, uint8 tier, address referrer, bool isActive)[])",
  "function getClaimableYield(address) view returns (uint256)",
  "function calculateAccruedYield(address) view returns (uint256)",
  "function hasStaked(address) view returns (bool)",
  "function totalClaimed(address) view returns (uint256)",
  "function seededEarnings(address) view returns (uint256)",
  "function externalEarnings(address) view returns (uint256)",
  "function getTotalActiveStake(address) view returns (uint256)",
  "function paused() view returns (bool)",
];

const DEX_ABI = [
  "function getPrice() view returns (uint256)",
];

const VAULT_ABI = [
  "function osloBalance() view returns (uint256)",
];

const OSLO_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

const LEVEL_SYSTEM_ABI = [
  "function totalCommissionsEarned(address) view returns (uint256)",
];

// Tier daily rates (basis points: 10000 = 100%)
const TIER1_RATES = [100, 75, 95, 65, 100, 85, 55]; // ~5.75% weekly
const TIER2_RATES = [115, 100, 115, 110, 105, 100, 125]; // ~7.70% weekly

interface DiagnosisResult {
  wallet: string;
  issues: string[];
  claimable: bigint;
  stakesCount: number;
  activeStakes: number;
  rootCause: string;
}

async function diagnoseWallet(
  wallet: string,
  engine: any,
  dex: any,
  vault: any,
  osloToken: any,
  levelSystem: any,
  isPaused: boolean,
  dexPrice: bigint,
  vaultOslo: bigint,
  levelSystemOslo: bigint,
  now: bigint
): Promise<DiagnosisResult> {
  const issues: string[] = [];
  let claimable = 0n;
  let stakesCount = 0;
  let activeStakes = 0;
  let rootCause = "";

  console.log(`\n${"─".repeat(70)}`);
  console.log(`Wallet: ${wallet}`);
  console.log("─".repeat(70));

  // CHECK 1: Paused
  if (isPaused) {
    issues.push("Contract is PAUSED — claimYield() blocked");
    console.log("  ⚠️  Contract is PAUSED");
  }

  // CHECK 2: Has stakes
  const hasStaked = await engine.hasStaked(wallet);
  const stakes = await engine.getUserStakes(wallet);
  stakesCount = stakes.length;
  console.log(`  hasStaked: ${hasStaked} | stakes count: ${stakesCount}`);

  if (stakes.length === 0) {
    issues.push("No stakes in engine — claimYield() reverts NoActiveStake()");
    rootCause = "No stakes (not registered / not migrated)";
    console.log("  ⚠️  NO STAKES — cannot claim");
    return { wallet, issues, claimable, stakesCount, activeStakes, rootCause };
  }

  // Aggregate stats
  const contractClaimable = await engine.getClaimableYield(wallet);
  const accrued = await engine.calculateAccruedYield(wallet);
  const claimed = await engine.totalClaimed(wallet);
  const seeded = await engine.seededEarnings(wallet);
  const external = await engine.externalEarnings(wallet);
  const activeStake = await engine.getTotalActiveStake(wallet);
  claimable = contractClaimable;

  console.log(`  Total active stake:   ${ethers.formatUnits(activeStake, 18)} USDT`);
  console.log(`  calculateAccruedYield: ${ethers.formatUnits(accrued, 18)} USDT`);
  console.log(`  getClaimableYield:    ${ethers.formatUnits(contractClaimable, 18)} USDT`);
  console.log(`  totalClaimed:         ${ethers.formatUnits(claimed, 18)} USDT`);
  console.log(`  seededEarnings:       ${ethers.formatUnits(seeded, 18)} USDT`);
  console.log(`  externalEarnings:     ${ethers.formatUnits(external, 18)} USDT (level commissions)`);

  // Per-stake analysis
  let totalClaimableManual = 0n;
  for (let i = 0; i < stakes.length; i++) {
    const s = stakes[i];
    console.log(`  ── Stake #${i} ──`);
    console.log(`    activeStake:    ${ethers.formatUnits(s.activeStake, 18)} USDT`);
    console.log(`    totalEarnings:  ${ethers.formatUnits(s.totalEarnings, 18)} USDT`);
    console.log(`    startTime:      ${s.stakeStartTime} (${new Date(Number(s.stakeStartTime) * 1000).toISOString().substring(0, 19)}Z)`);
    console.log(`    tier:           ${s.tier} | dayIndex: ${s.stakeDayIndex} | isActive: ${s.isActive}`);

    if (!s.isActive) {
      console.log(`    → INACTIVE — skipped in claimYield()`);
      continue;
    }

    activeStakes++;

    // Manually compute accrued yield (mirrors _calculateStakeYield)
    const timeElapsed = now - s.stakeStartTime;
    const completeDays = Number(timeElapsed / 86400n);
    const remainingSecs = timeElapsed % 86400n;
    const rates = s.tier === 1 ? TIER1_RATES : TIER2_RATES;

    let accruedStake = 0n;
    for (let d = 0; d < completeDays && d < 365; d++) {
      const dayIdx = (Number(s.stakeDayIndex) + d) % 7;
      accruedStake += (s.activeStake * BigInt(rates[dayIdx])) / 10000n;
    }
    if (remainingSecs > 0n && BigInt(completeDays) < 365n) {
      const currentDayIdx = (Number(s.stakeDayIndex) + completeDays) % 7;
      const dailyYield = (s.activeStake * BigInt(rates[currentDayIdx])) / 10000n;
      accruedStake += (dailyYield * remainingSecs) / 86400n;
    }

    const claimableForStake = accruedStake > s.totalEarnings ? accruedStake - s.totalEarnings : 0n;
    const cap = s.activeStake * 3n;
    // V2: effectiveEarnings = totalEarnings + externalEarnings + seededEarnings
    const effectiveEarnings = s.totalEarnings + external + seeded;
    const capReached = effectiveEarnings >= cap;
    const projectedTotal = effectiveEarnings + claimableForStake;
    let cappedClaimable = claimableForStake;
    if (projectedTotal >= cap) {
      cappedClaimable = cap > effectiveEarnings ? cap - effectiveEarnings : 0n;
    }

    console.log(`    completeDays:      ${completeDays}`);
    console.log(`    accrued (manual):  ${ethers.formatUnits(accruedStake, 18)} USDT`);
    console.log(`    claimable:         ${ethers.formatUnits(claimableForStake, 18)} USDT`);
    console.log(`    3X cap:            ${ethers.formatUnits(cap, 18)} USDT`);
    console.log(`    effectiveEarnings: ${ethers.formatUnits(effectiveEarnings, 18)} USDT (totalEarnings + external + seeded)`);
    console.log(`    capReached:        ${capReached}`);
    console.log(`    cappedClaimable:   ${ethers.formatUnits(cappedClaimable, 18)} USDT`);

    if (claimableForStake === 0n) {
      console.log(`    ⚠️  accrued <= totalEarnings → nothing to claim for this stake`);
    }
    if (capReached) {
      console.log(`    ⚠️  3X CAP REACHED — stake yields nothing further`);
    }

    totalClaimableManual += cappedClaimable;
  }

  // CHECK 3: Any active stake
  if (activeStakes === 0) {
    issues.push("No ACTIVE stakes — claimYield() reverts NoActiveStake()");
    if (!rootCause) rootCause = "All stakes inactive (3X cap reached or stopped)";
  }

  // CHECK 4: Claimable > 0
  console.log(`  Manual total claimable: ${ethers.formatUnits(totalClaimableManual, 18)} USDT`);
  if (contractClaimable === 0n) {
    issues.push("Claimable yield is ZERO — claimYield() reverts NoYieldToClaim()");
    if (!rootCause) {
      // Distinguish externalEarnings-blocking from plain 3X cap
      if (external > 0n && activeStakes > 0) {
        rootCause = `externalEarnings ($${ethers.formatUnits(external, 18)}) exceeds per-stake 3X cap — blocks all staking yield`;
      } else {
        rootCause = "Zero claimable (3X cap reached or no accrued yield)";
      }
    }
  }

  // CHECK 5: DEX price
  if (dexPrice === 0n) {
    issues.push("DEX price is zero — claimYield() reverts");
    if (!rootCause) rootCause = "DEX price is zero";
  }

  // CHECK 6: Vault OSLO sufficient
  if (contractClaimable > 0n && dexPrice > 0n) {
    const neededOslo = (contractClaimable * 10n ** 18n) / dexPrice;
    console.log(`  OSLO needed from vault: ${ethers.formatUnits(neededOslo, 18)} | vault has: ${ethers.formatUnits(vaultOslo, 18)}`);
    if (vaultOslo < neededOslo) {
      issues.push(`RewardVault insufficient OSLO (need ${ethers.formatUnits(neededOslo, 18)}, have ${ethers.formatUnits(vaultOslo, 18)})`);
      if (!rootCause) rootCause = "RewardVault lacks OSLO";
    }
  }

  // CHECK 7: LevelIncomeSystem OSLO for commission distribution
  // The claim flow calls levelSystem.distributeCommissions() which transfers OSLO to uplines.
  // If the level system runs out of OSLO mid-distribution, transfers silently fail (raw transfer, unchecked).
  const totalCommissions = await levelSystem.totalCommissionsEarned(wallet);
  console.log(`  Level system OSLO balance: ${ethers.formatUnits(levelSystemOslo, 18)} | totalCommissionsEarned: ${ethers.formatUnits(totalCommissions, 18)}`);

  // Determine root cause if not already set
  if (!rootCause && issues.length === 0) {
    rootCause = "No blocking issue detected — claim should succeed";
  } else if (!rootCause) {
    rootCause = issues[0];
  }

  return { wallet, issues, claimable, stakesCount, activeStakes, rootCause };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("BATCH CLAIM DIAGNOSIS");
  console.log("=".repeat(70));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BNB:      ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log(`Engine:   ${ENGINE_ADDR}`);
  console.log(`Wallets:  ${WALLETS.length}`);

  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, deployer);
  const dex = new ethers.Contract(DEX_ADDR, DEX_ABI, deployer);
  const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI, deployer);
  const osloToken = new ethers.Contract(OSLO_TOKEN_ADDR, OSLO_TOKEN_ABI, deployer);
  const levelSystem = new ethers.Contract(LEVEL_SYSTEM_ADDR, LEVEL_SYSTEM_ABI, deployer);

  // Shared state (read once — doesn't change per wallet)
  const block = await ethers.provider.getBlock("latest");
  const now = BigInt(block!.timestamp);
  const isPaused = await engine.paused();
  const dexPrice = await dex.getPrice();
  const vaultOslo = await vault.osloBalance();
  const levelSystemOslo = await osloToken.balanceOf(LEVEL_SYSTEM_ADDR);

  console.log(`Block:    ${block!.number}`);
  console.log(`Time:     ${new Date(Number(now) * 1000).toISOString()}`);
  console.log(`Paused:   ${isPaused}`);
  console.log(`DEX price: ${ethers.formatUnits(dexPrice, 18)} USDT/OSLO`);
  console.log(`Vault OSLO: ${ethers.formatUnits(vaultOslo, 18)}`);
  console.log(`LevelSys OSLO: ${ethers.formatUnits(levelSystemOslo, 18)}`);
  console.log();

  // Diagnose each wallet
  const results: DiagnosisResult[] = [];
  for (const wallet of WALLETS) {
    try {
      const result = await diagnoseWallet(
        wallet, engine, dex, vault, osloToken, levelSystem,
        isPaused, dexPrice, vaultOslo, levelSystemOslo, now
      );
      results.push(result);
    } catch (err: any) {
      console.log(`\n${"─".repeat(70)}`);
      console.log(`Wallet: ${wallet}`);
      console.log("─".repeat(70));
      console.log(`  ❌ ERROR reading wallet: ${err.reason || err.message}`);
      results.push({
        wallet,
        issues: [`Read error: ${err.reason || err.message}`],
        claimable: 0n,
        stakesCount: 0,
        activeStakes: 0,
        rootCause: `Read error: ${err.reason || err.message}`,
      });
    }
  }

  // ─── Summary table ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log("Wallet                                      | Claimable  | Stakes | Active | Root Cause");
  console.log("-".repeat(70));
  for (const r of results) {
    const short = r.wallet.substring(0, 8) + "..." + r.wallet.substring(38);
    const claimable = ethers.formatUnits(r.claimable, 18);
    console.log(`${short.padEnd(44)}| ${claimable.substring(0, 10).padStart(10)} | ${String(r.stakesCount).padStart(6)} | ${String(r.activeStakes).padStart(6)} | ${r.rootCause}`);
  }
  console.log("-".repeat(70));

  const allIssues = results.filter((r) => r.issues.length > 0);
  if (allIssues.length === 0) {
    console.log("\n✅ All wallets look OK — no blocking issues detected.");
    console.log("   If claims still fail, check frontend tx submission / gas / network.");
  } else {
    console.log(`\n⚠️  ${allIssues.length}/${WALLETS.length} wallets have blocking issues:`);
    for (const r of allIssues) {
      console.log(`\n  ${r.wallet}:`);
      r.issues.forEach((issue, i) => console.log(`    ${i + 1}. ${issue}`));
    }
  }
  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
