import { ethers } from "hardhat";

/**
 * drain-old-mainnet.ts
 * --------------------
 * Drains liquidity from old BSC Mainnet contracts back to deployer wallet.
 *
 * Strategy:
 *   1. Check on-chain state (admin, setupComplete, balances)
 *   2. Deploy DEXDrainer helper contract
 *   3. Whitelist drainer on OSLOToken (no sell tax)
 *   4. Set drainer as InvestmentEngine on DEX (admin or timelock path)
 *   5. Fund drainer with USDT → drain OSLO from DEX (swapYieldForOSLO)
 *   6. Fund drainer with OSLO → drain USDT from DEX (processWithdrawal)
 *   7. Report final balances
 *
 * Run: npx hardhat run scripts/drain-old-mainnet.ts --network bscMainnet
 */

// ─── Old Mainnet Contract Addresses ─────────────────────────────────────
const CONTRACTS = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  OSLOToken: "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c",
  OSLODEX: "0xCBa239e2aE0b7d84A156399ea1791C1Dd70b5e52",
  OSLOTreasury: "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF",
  OSLOLiquidityManager: "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E",
  OSLODAO: "0x708C360721baabb9FA982b37c79Fd3E21e374FEF",
  OSLORankSystem: "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C",
  OSLOReferral: "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e",
  OSLOInvestmentEngine: "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa",
};

// Minimal ABIs for interactions
const DEX_ABI = [
  "function admin() view returns (address)",
  "function timelock() view returns (address)",
  "function investmentEngine() view returns (address)",
  "function setupComplete() view returns (bool)",
  "function usdtReserve() view returns (uint256)",
  "function osloReserve() view returns (uint256)",
  "function getReserves() view returns (uint256, uint256)",
  "function forceSetInvestmentEngine(address) external",
  "function setInvestmentEngine(address) external",
  "function configure(address,address,address) external",
];

const TOKEN_ABI = [
  "function admin() view returns (address)",
  "function setupComplete() view returns (bool)",
  "function setTaxWhitelist(address,bool) external",
  "function isTaxWhitelisted(address) view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];

const TREASURY_ABI = [
  "function timelock() view returns (address)",
  "function rescueERC20(address,uint256) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       OSLO Protocol — Old Mainnet Liquidity Drain           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nDeployer: ${deployer.address}`);
  const bnbBal = await ethers.provider.getBalance(deployer.address);
  console.log(`BNB Balance: ${ethers.formatEther(bnbBal)} BNB`);

  if (bnbBal < ethers.parseEther("0.005")) {
    console.error("\n❌ ERROR: Need at least 0.005 BNB for gas. Fund deployer first.");
    process.exit(1);
  }

  // ─── Step 1: Inspect on-chain state ─────────────────────────────────────
  console.log("\n┌─ Step 1: Inspecting on-chain state ─────────────────────────┐");

  const usdt = new ethers.Contract(CONTRACTS.USDT, ERC20_ABI, deployer);
  const osloToken = new ethers.Contract(CONTRACTS.OSLOToken, TOKEN_ABI, deployer);
  const dex = new ethers.Contract(CONTRACTS.OSLODEX, DEX_ABI, deployer);
  const treasury = new ethers.Contract(CONTRACTS.OSLOTreasury, TREASURY_ABI, deployer);

  // Check DEX state
  const dexAdmin = await dex.admin();
  const dexTimelock = await dex.timelock();
  const dexIE = await dex.investmentEngine();
  const dexSetup = await dex.setupComplete();
  console.log(`  DEX admin:            ${dexAdmin}`);
  console.log(`  DEX timelock:         ${dexTimelock}`);
  console.log(`  DEX investmentEngine: ${dexIE}`);
  console.log(`  DEX setupComplete:    ${dexSetup}`);

  // Check Token state
  const tokenAdmin = await osloToken.admin();
  const tokenSetup = await osloToken.setupComplete();
  console.log(`  Token admin:          ${tokenAdmin}`);
  console.log(`  Token setupComplete:  ${tokenSetup}`);

  // Check all contract balances
  console.log("\n  ── Contract Balances ──");
  const balances: Record<string, { usdt: bigint; oslo: bigint }> = {};
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    if (name === "USDT" || name === "OSLOToken") continue;
    const uBal = await usdt.balanceOf(addr);
    const oBal = await osloToken.balanceOf(addr);
    balances[name] = { usdt: uBal, oslo: oBal };
    if (uBal > 0n || oBal > 0n) {
      console.log(`  ${name}:`);
      if (uBal > 0n) console.log(`    USDT: ${ethers.formatEther(uBal)}`);
      if (oBal > 0n) console.log(`    OSLO: ${ethers.formatEther(oBal)}`);
    }
  }

  const deployerUSDT = await usdt.balanceOf(deployer.address);
  const deployerOSLO = await osloToken.balanceOf(deployer.address);
  console.log(`\n  Deployer USDT: ${ethers.formatEther(deployerUSDT)}`);
  console.log(`  Deployer OSLO: ${ethers.formatEther(deployerOSLO)}`);

  // ─── Step 2: Determine access path ──────────────────────────────────────
  console.log("\n┌─ Step 2: Determining admin access path ─────────────────────┐");

  const isAdmin = dexAdmin.toLowerCase() === deployer.address.toLowerCase();
  const isTimelock = dexTimelock.toLowerCase() === deployer.address.toLowerCase();
  const canChangeIE = isAdmin || isTimelock;

  if (isAdmin) {
    console.log("  ✓ Deployer IS the DEX admin — can use forceSetInvestmentEngine");
  } else if (isTimelock) {
    console.log("  ✓ Deployer IS the DEX timelock — can use setInvestmentEngine");
  } else {
    console.log("  ✗ Deployer is NOT admin or timelock on DEX.");
    console.log(`    Admin: ${dexAdmin}`);
    console.log(`    Timelock: ${dexTimelock}`);
    console.log("  Cannot change InvestmentEngine. DEX liquidity is NOT drainable.");
  }

  const isTokenAdmin = tokenAdmin.toLowerCase() === deployer.address.toLowerCase();
  if (isTokenAdmin) {
    console.log("  ✓ Deployer IS the Token admin — can whitelist from sell tax");
  }

  // Check if DEX has anything worth draining
  const dexUSDT = balances["OSLODEX"]?.usdt ?? 0n;
  const dexOSLO = balances["OSLODEX"]?.oslo ?? 0n;

  if (dexUSDT === 0n && dexOSLO === 0n) {
    console.log("\n  ℹ DEX is already empty. Nothing to drain.");
  }

  if (!canChangeIE || (dexUSDT === 0n && dexOSLO === 0n)) {
    console.log("\n┌─ Summary ───────────────────────────────────────────────────┐");
    console.log("  IE OSLO (locked, no rescue fn): " + ethers.formatEther(balances["OSLOInvestmentEngine"]?.oslo ?? 0n));
    console.log("  DEX (requires admin):           " + ethers.formatEther(dexUSDT) + " USDT + " + ethers.formatEther(dexOSLO) + " OSLO");
    console.log("  ⚠ Cannot drain further without contract upgrade or rescue functions.");
    return;
  }

  // ─── Step 3: Deploy DEXDrainer ──────────────────────────────────────────
  console.log("\n┌─ Step 3: Deploying DEXDrainer helper ───────────────────────┐");

  const DrainerFactory = await ethers.getContractFactory("DEXDrainer");
  const drainer = await DrainerFactory.deploy(CONTRACTS.USDT, CONTRACTS.OSLOToken, CONTRACTS.OSLODEX);
  await drainer.waitForDeployment();
  const drainerAddr = await drainer.getAddress();
  console.log(`  DEXDrainer deployed at: ${drainerAddr}`);

  // ─── Step 4: Whitelist drainer on token (no sell tax) ───────────────────
  if (isTokenAdmin) {
    console.log("\n┌─ Step 4: Whitelisting drainer on OSLOToken ─────────────────┐");
    let tx = await osloToken.setTaxWhitelist(drainerAddr, true);
    await tx.wait();
    console.log("  ✓ Drainer whitelisted (no sell tax)");
  }

  // ─── Step 5: Set drainer as InvestmentEngine on DEX ─────────────────────
  console.log("\n┌─ Step 5: Setting drainer as InvestmentEngine on DEX ────────┐");
  let tx;
  if (isAdmin && !dexSetup) {
    // Before setup complete, admin can use forceSetInvestmentEngine
    tx = await dex.forceSetInvestmentEngine(drainerAddr);
    await tx.wait();
    console.log("  ✓ Used forceSetInvestmentEngine (admin, pre-setup)");
  } else if (isAdmin) {
    // After setup but admin still set — try forceSet (no setupComplete check)
    tx = await dex.forceSetInvestmentEngine(drainerAddr);
    await tx.wait();
    console.log("  ✓ Used forceSetInvestmentEngine (admin)");
  } else if (isTimelock) {
    tx = await dex.setInvestmentEngine(drainerAddr);
    await tx.wait();
    console.log("  ✓ Used setInvestmentEngine (timelock)");
  }

  // Verify
  const newIE = await dex.investmentEngine();
  if (newIE.toLowerCase() !== drainerAddr.toLowerCase()) {
    console.error("  ❌ Failed to set drainer as IE. Aborting.");
    process.exit(1);
  }
  console.log("  ✓ Verified: DEX.investmentEngine = drainer");

  // ─── Step 6: Drain OSLO from DEX (swap USDT in, get OSLO out) ───────────
  console.log("\n┌─ Step 6: Draining OSLO from DEX ────────────────────────────┐");

  // Check how much USDT we can afford to use (we'll get it back in step 7)
  const [currentUSDTRes, currentOSLORes] = await dex.getReserves();
  console.log(`  DEX Reserves: ${ethers.formatEther(currentUSDTRes)} USDT, ${ethers.formatEther(currentOSLORes)} OSLO`);

  if (currentOSLORes > 0n && deployerUSDT > 0n) {
    // Use deployer's USDT to buy OSLO from DEX. Use current USDT reserve * 10 to drain ~91% of OSLO
    // Formula: osloOut = (usdtIn * osloReserve) / (usdtReserve + usdtIn)
    // To drain ~99%: need usdtIn = usdtReserve * 99 ≈ 283 USDT
    // To drain ~90%: need usdtIn = usdtReserve * 9 ≈ 25.7 USDT
    // We'll use min(deployerUSDT, usdtReserve * 50) to drain ~98%
    let usdtToUse = currentUSDTRes * 50n;
    if (usdtToUse > deployerUSDT) {
      usdtToUse = deployerUSDT;
    }
    // Don't use more than 500 USDT even if deployer has more
    const maxDrain = ethers.parseEther("500");
    if (usdtToUse > maxDrain) {
      usdtToUse = maxDrain;
    }

    const expectedOSLO = (usdtToUse * currentOSLORes) / (currentUSDTRes + usdtToUse);
    const pctDrain = Number((expectedOSLO * 10000n) / currentOSLORes) / 100;
    console.log(`  Using ${ethers.formatEther(usdtToUse)} USDT to drain ~${pctDrain.toFixed(1)}% of OSLO`);
    console.log(`  Expected OSLO out: ${ethers.formatEther(expectedOSLO)}`);

    // Transfer USDT to drainer
    tx = await usdt.transfer(drainerAddr, usdtToUse);
    await tx.wait();
    console.log(`  ✓ Funded drainer with ${ethers.formatEther(usdtToUse)} USDT`);

    // Execute drain
    tx = await drainer.drainOSLO(usdtToUse);
    const receipt = await tx.wait();
    console.log(`  ✓ drainOSLO executed (gas: ${receipt!.gasUsed.toString()})`);

    const osloGained = await osloToken.balanceOf(deployer.address);
    console.log(`  Deployer OSLO balance now: ${ethers.formatEther(osloGained)}`);
  } else if (currentOSLORes === 0n) {
    console.log("  ℹ DEX has no OSLO to drain.");
  } else {
    console.log("  ⚠ Deployer has no USDT to use for OSLO drain.");
  }

  // ─── Step 7: Drain USDT from DEX (return OSLO, get USDT out) ────────────
  console.log("\n┌─ Step 7: Draining USDT from DEX ────────────────────────────┐");

  const [usdtResNow, osloResNow] = await dex.getReserves();
  console.log(`  DEX Reserves now: ${ethers.formatEther(usdtResNow)} USDT, ${ethers.formatEther(osloResNow)} OSLO`);

  const deployerOSLONow = await osloToken.balanceOf(deployer.address);

  if (usdtResNow > 0n && deployerOSLONow > 0n) {
    // Calculate OSLO needed to drain all USDT
    // Formula: usdtOut = (osloIn * usdtReserve) / (osloReserve + osloIn)
    // To get ~99% of USDT: osloIn = osloReserve * 99
    let osloToUse = osloResNow * 100n; // Drain ~99% of USDT
    if (osloToUse > deployerOSLONow) {
      osloToUse = deployerOSLONow;
    }

    const expectedUSDT = (osloToUse * usdtResNow) / (osloResNow + osloToUse);
    const pctUSDTDrain = Number((expectedUSDT * 10000n) / usdtResNow) / 100;
    console.log(`  Using ${ethers.formatEther(osloToUse)} OSLO to drain ~${pctUSDTDrain.toFixed(1)}% of USDT`);
    console.log(`  Expected USDT out: ${ethers.formatEther(expectedUSDT)}`);

    // Transfer OSLO to drainer
    tx = await osloToken.transfer(drainerAddr, osloToUse);
    await tx.wait();
    console.log(`  ✓ Funded drainer with ${ethers.formatEther(osloToUse)} OSLO`);

    // Execute drain
    tx = await drainer.drainUSDT(osloToUse);
    const receipt = await tx.wait();
    console.log(`  ✓ drainUSDT executed (gas: ${receipt!.gasUsed.toString()})`);

    const usdtGained = await usdt.balanceOf(deployer.address);
    console.log(`  Deployer USDT balance now: ${ethers.formatEther(usdtGained)}`);
  } else if (usdtResNow === 0n) {
    console.log("  ℹ DEX has no USDT to drain.");
  } else {
    console.log("  ⚠ Deployer has no OSLO to use for USDT drain.");
  }

  // ─── Step 8: Final report ───────────────────────────────────────────────
  console.log("\n┌─ Step 8: Final Report ──────────────────────────────────────┐");

  const [finalUSDTRes, finalOSLORes] = await dex.getReserves();
  const finalDeployerUSDT = await usdt.balanceOf(deployer.address);
  const finalDeployerOSLO = await osloToken.balanceOf(deployer.address);
  const ieOSLO = await osloToken.balanceOf(CONTRACTS.OSLOInvestmentEngine);

  console.log(`  DEX remaining:   ${ethers.formatEther(finalUSDTRes)} USDT, ${ethers.formatEther(finalOSLORes)} OSLO`);
  console.log(`  Deployer:        ${ethers.formatEther(finalDeployerUSDT)} USDT, ${ethers.formatEther(finalDeployerOSLO)} OSLO`);
  console.log(`  IE (LOCKED):     ${ethers.formatEther(ieOSLO)} OSLO (no rescue function)`);
  console.log("");
  console.log("  ⚠ InvestmentEngine OSLO is permanently locked — contract has no rescue/withdraw.");
  console.log("  ✓ DEX drain complete.");
  console.log(`\n  Drainer contract: ${drainerAddr}`);
  console.log("  (Can be abandoned — all funds returned to deployer)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
