import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

// Existing contract addresses on BSC Testnet (DO NOT CHANGE)
const EXISTING = {
  usdt: "0xdFAff6C92d9d4e0935cAF3429e80C821A044161c",
  osloToken: "0x203D33abBf8cbb3ce4A8f61Cf13e10394A0bE65C",
  treasury: "0x6d4e694fa067A63A17c4187f795f9ED7D1f76810",
  liquidityManager: "0x80e990fe6C9313c0a4Dbc82Ed28bC88bDf75a279",
  dao: "0xD654c35fAaA33217e55b86c6C1bD4FCCc0B1F05f",
  rankSystem: "0x7f063C8DA2AA9C44fDB92D0346031f873C891811",
  referral: "0x57e7317f6ff98881fdc54604bf64DA274478B157",
  oldInvestmentEngine: "0xe54a5E4811eA5014FAF5304e5A12D309A0135F2F",
  oldOslodex: "0x109944D383b476bc7257F68e137D4011E534A34f",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying OSLODEX + OSLOInvestmentEngine with fixes");
  console.log("Account:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB");
  if (bal < ethers.parseEther("0.005")) {
    console.error("ERROR: Need at least 0.005 BNB for gas. Please fund the account.");
    process.exit(1);
  }

  // ─── Step 1: Deploy new OSLODEX ────────────────────────────────────
  console.log("\n--- Step 1: Deploying new OSLODEX ---");
  const OSLODEX = await ethers.getContractFactory("OSLODEX");
  const newDex = await OSLODEX.deploy(EXISTING.usdt, EXISTING.osloToken);
  await newDex.waitForDeployment();
  const newDexAddr = await newDex.getAddress();
  console.log("New OSLODEX:", newDexAddr);

  // ─── Step 2: Deploy new OSLOInvestmentEngine ───────────────────────
  console.log("\n--- Step 2: Deploying new OSLOInvestmentEngine ---");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const newEngine = await OSLOInvestmentEngine.deploy(
    EXISTING.usdt,
    EXISTING.osloToken,
    LAUNCH_TIMESTAMP
  );
  await newEngine.waitForDeployment();
  const newEngineAddr = await newEngine.getAddress();
  console.log("New OSLOInvestmentEngine:", newEngineAddr);

  // ─── Step 3: Configure new OSLODEX ────────────────────────────────
  console.log("\n--- Step 3: Configuring new OSLODEX ---");
  let tx = await newDex.configure(deployer.address, EXISTING.liquidityManager, newEngineAddr);
  await tx.wait();
  console.log("OSLODEX configured (LM + IE)");

  // ─── Step 4: Configure new InvestmentEngine ───────────────────────
  console.log("\n--- Step 4: Configuring new InvestmentEngine ---");
  tx = await newEngine.configure(
    EXISTING.treasury,
    EXISTING.referral,
    EXISTING.rankSystem,
    newDexAddr,
    deployer.address
  );
  await tx.wait();
  console.log("InvestmentEngine configured");

  // ─── Step 5: Seed new DEX with initial liquidity ─────────────────
  console.log("\n--- Step 5: Seeding DEX liquidity ---");
  const osloToken = await ethers.getContractAt("OSLOToken", EXISTING.osloToken);
  
  // Transfer 50K OSLO from old IE to new DEX (if old IE has balance)
  const oldIEOsloBal = await osloToken.balanceOf(EXISTING.oldInvestmentEngine);
  console.log("Old IE OSLO balance:", ethers.formatEther(oldIEOsloBal));
  
  if (oldIEOsloBal > 0n) {
    // We need to transfer from old IE — but we don't control it
    // Alternative: send from deployer's own OSLO
  }
  
  // Transfer deployer's OSLO to DEX for seeding
  const deployerOslo = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO:", ethers.formatEther(deployerOslo));
  
  // Transfer deployer's USDT for DEX seed
  const usdt = await ethers.getContractAt("IERC20", EXISTING.usdt);
  const deployerUsdt = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT:", ethers.formatEther(deployerUsdt));

  if (deployerOslo > 0n && deployerUsdt > ethers.parseEther("100")) {
    const seedUsdt = ethers.parseEther("100");
    const seedOslo = deployerOslo > ethers.parseEther("50000") ? ethers.parseEther("50000") : deployerOslo;
    
    // Approve and add liquidity directly to DEX
    tx = await osloToken.approve(newDexAddr, seedOslo);
    await tx.wait();
    tx = await usdt.approve(newDexAddr, seedUsdt);
    await tx.wait();
    tx = await newDex.addInitialLiquidity(seedUsdt, seedOslo);
    await tx.wait();
    console.log("Seeded DEX with:", ethers.formatEther(seedUsdt), "USDT +", ethers.formatEther(seedOslo), "OSLO");
  } else {
    console.log("WARNING: Not enough tokens for DEX seed. DEX may not function without initial liquidity.");
    console.log("Fund deployer with USDT and OSLO, then call addInitialLiquidity on DEX.");
  }

  // ─── Step 6: Transfer OSLO reserve to new IE ──────────────────────
  console.log("\n--- Step 6: Transferring OSLO reserve ---");
  if (oldIEOsloBal > ethers.parseEther("1000000")) {
    // Try to transfer from old IE - but we can't unless we're the owner
    console.log("NOTE: Old IE holds", ethers.formatEther(oldIEOsloBal), "OSLO");
    console.log("You may need to manually transfer OSLO from old IE to new IE via the token contract.");
  }

  // ─── Step 7: Update cross-contract references ────────────────────
  console.log("\n--- Step 7: Updating cross-contract references ---");
  
  // Update OSLOToken's investmentEngine (sell tax routing)
  const osloTokenContract = await ethers.getContractAt("OSLOToken", EXISTING.osloToken);
  tx = await osloTokenContract.setInvestmentEngine(newEngineAddr);
  await tx.wait();
  console.log("OSLOToken.investmentEngine updated → new IE");

  // Update OSLOReferral's investmentEngine (level income tracking)
  const referralContract = await ethers.getContractAt("OSLOReferral", EXISTING.referral);
  tx = await referralContract.setInvestmentEngine(newEngineAddr);
  await tx.wait();
  console.log("OSLOReferral.investmentEngine updated → new IE");

  // Update OSLORankSystem's investmentEngine (rank bonus tracking)
  const rankSystemContract = await ethers.getContractAt("OSLORankSystem", EXISTING.rankSystem);
  tx = await rankSystemContract.setInvestmentEngine(newEngineAddr);
  await tx.wait();
  console.log("OSLORankSystem.investmentEngine updated → new IE");

  // Update new InvestmentEngine's referral (in case old Referral was redeployed too)
  // The IE already points to EXISTING.referral from configure(), so we're good.

  console.log("\n✅ All cross-contract references wired to new InvestmentEngine!")

  // ─── Step 8: Complete setup ──────────────────────────────────────
  console.log("\n--- Step 8: Completing setup ---");
  tx = await newEngine.completeSetup();
  await tx.wait();
  console.log("New InvestmentEngine setup complete");

  // ─── Summary ────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("REDEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log("New OSLODEX:            ", newDexAddr);
  console.log("New InvestmentEngine:   ", newEngineAddr);
  console.log("");
  console.log("✅ All contracts wired:");
  console.log("  - OSLOToken.investmentEngine → new IE");
  console.log("  - OSLOReferral.investmentEngine → new IE");
  console.log("  - OSLORankSystem.investmentEngine → new IE");
  console.log("  - New IE → existing Referral, RankSystem, Treasury");
  console.log("  - New OSLODEX → New IE (investmentEngine)");
  console.log("═══════════════════════════════════════════════");

  // Output frontend config
  console.log("\n// Updated frontend CONTRACTS:");
  console.log(`  osloDEX: "${newDexAddr}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${newEngineAddr}" as \`0x\${string}\`,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
