import { ethers } from "hardhat";

// V3 Registration Fee Fix — Continue from partial V4 deployment
// Deployer: 0x47f8160e3C854b4b4679579b99726E5E81736B7f
// Deployed but needs wiring continuation + steps 11-15

const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  
  const bal = await ethers.provider.getBalance(admin);
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(bal), "BNB");

  // V3 deployed addresses (from partial V4 redeployment)
  const USDT   = "0x172AaACeD5bfd0aCd9d89e251D23D662D88bd85D";
  const OSLO   = "0x19Be97Ba09aff2Bf754Ca5EFB06EFA3AB40ed4a8";
  const LM_ADDR= "0x3e0d47486950Da37A2801ebC21902aC58ECDf527";
  const DEX_ADDR="0x08Dec2E290616B7514688acD5580b6e3F68C95Ee";
  const IE_ADDR = "0xfa35Db5f5Ca672cA67f7942848Dd67bc21c41416";
  const REF_ADDR= "0xB602c7168413C6468cd211B8ebed1F614c4423D7";
  const RANK_ADDR="0x4fE6932eAd8cB9bF80F21E853D33f994Eac5dBE3";
  const TREASURY_ADDR="0xaB3c9f0c74be8538D97971513449e37389f1922D";
  const DAO_ADDR = "0x18C7171323c880a6F391378e7215e1a6E5e67E92";

  // Connect to contracts
  const usdt = await ethers.getContractAt("MockUSDT", USDT);
  const oslo = await ethers.getContractAt("OSLOToken", OSLO);
  const lm   = await ethers.getContractAt("OSLOLiquidityManager", LM_ADDR);
  const dex  = await ethers.getContractAt("OSLODEX", DEX_ADDR);
  const ie   = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);
  const ref  = await ethers.getContractAt("OSLOReferral", REF_ADDR);
  const rank = await ethers.getContractAt("OSLORankSystem", RANK_ADDR);
  const treasury = await ethers.getContractAt("OSLOTreasury", TREASURY_ADDR);
  const dao  = await ethers.getContractAt("OSLODAO", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 10. Continue Wiring (Rank + Treasury + DAO remaining)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n10. Continue Wiring");

  // Check what's already wired
  try {
    const dexIE = await dex.investmentEngine();
    const dexRef = await dex.referralContract();
    console.log("  DEX IE:", dexIE, "| Ref:", dexRef);
  } catch {}

  try {
    // RankSystem.configure(ie, referral, timelock)
    console.log("  Wiring Rank → IE + Referral...");
    let tx = await rank.configure(IE_ADDR, REF_ADDR, admin);
    await tx.wait();
    console.log("  ✓ Rank → IE + Referral");
  } catch (e: any) {
    if (e.message?.includes("SetupAlreadyComplete")) {
      console.log("  ✓ Rank already configured");
    } else {
      console.log("  ⚠ Rank.configure failed:", e.message?.slice(0, 100));
    }
  }

  try {
    // Treasury.configure(rank, dao, lm, timelock)
    console.log("  Wiring Treasury → Rank + DAO + LM...");
    let tx = await treasury.configure(RANK_ADDR, DAO_ADDR, LM_ADDR, admin);
    await tx.wait();
    console.log("  ✓ Treasury → Rank + DAO + LM");
  } catch (e: any) {
    if (e.message?.includes("SetupAlreadyComplete")) {
      console.log("  ✓ Treasury already configured");
    } else {
      console.log("  ⚠ Treasury.configure failed:", e.message?.slice(0, 100));
    }
  }

  try {
    // DAO.configure(timelock, ie)
    console.log("  Wiring DAO → IE...");
    let tx = await dao.configure(admin, IE_ADDR);
    await tx.wait();
    console.log("  ✓ DAO → IE");
  } catch (e: any) {
    if (e.message?.includes("SetupAlreadyComplete")) {
      console.log("  ✓ DAO already configured");
    } else {
      console.log("  ⚠ DAO.configure failed:", e.message?.slice(0, 100));
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken config (whitelists + sell endpoint)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n11. OSLOToken config");
  try {
    let tx = await oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR);
    await tx.wait();
  } catch (e: any) {
    if (!e.message?.includes("already")) console.log("  ⚠ setSellTaxAddresses:", e.message?.slice(0, 80));
  }

  const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
  for (const a of whitelist) {
    try {
      let tx = await oslo.setTaxWhitelist(a, true);
      await tx.wait();
    } catch (e: any) {
      if (!e.message?.includes("already")) console.log("  ⚠ whitelist", a.slice(0, 10), ":", e.message?.slice(0, 50));
    }
  }
  try {
    let tx = await oslo.setSellEndpoint(DEX_ADDR, true);
    await tx.wait();
  } catch (e: any) {
    if (!e.message?.includes("already")) console.log("  ⚠ setSellEndpoint:", e.message?.slice(0, 50));
  }
  console.log("  ✓", whitelist.length, "addresses whitelisted + DEX sell endpoint");

  // ═══════════════════════════════════════════════════════════════════
  // 12. Transfer OSLO allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n12. OSLO allocations");
  try {
    let tx = await oslo.transfer(IE_ADDR, ethers.parseEther("11000000"));
    await tx.wait();
    console.log("  ✓ 11,000,000 OSLO → IE");
  } catch (e: any) { console.log("  ⚠ IE transfer:", e.message?.slice(0, 80)); }

  try {
    let tx = await oslo.transfer(LM_ADDR, ethers.parseEther("100000"));
    await tx.wait();
    console.log("  ✓ 100,000 OSLO → LM");
  } catch (e: any) { console.log("  ⚠ LM transfer:", e.message?.slice(0, 80)); }

  // ═══════════════════════════════════════════════════════════════════
  // 13. Mint test USDT + Seed DEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n13. Seed DEX");
  try {
    let tx = await usdt.mint(admin, ethers.parseEther("20000"));
    await tx.wait();
    console.log("  ✓ 20,000 USDT minted to deployer");
  } catch (e: any) { console.log("  ⚠ mint:", e.message?.slice(0, 80)); }

  try {
    const seedUsdt = ethers.parseEther("1000");
    let tx = await usdt.transfer(LM_ADDR, seedUsdt);
    await tx.wait();
    tx = await lm.addInitialLiquidity(seedUsdt);
    await tx.wait();
    const [rU, rO] = await dex.getReserves();
    console.log("  ✓ DEX seeded:", ethers.formatEther(rU), "USDT +", ethers.formatEther(rO), "OSLO");
    console.log("  ✓ Deployer USDT balance:", ethers.formatEther(await usdt.balanceOf(admin)));
  } catch (e: any) { console.log("  ⚠ seed DEX:", e.message?.slice(0, 80)); }

  // ═══════════════════════════════════════════════════════════════════
  // 14. Register root referral
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n14. Root referral");
  try {
    let tx = await usdt.approve(REF_ADDR, ethers.parseEther("1"));
    await tx.wait();
    tx = await ref.register(admin, ethers.ZeroAddress);
    await tx.wait();
    console.log("  ✓ deployer registered as root");
  } catch (e: any) { console.log("  ⚠ root referral:", e.message?.slice(0, 80)); }

  // ═══════════════════════════════════════════════════════════════════
  // 15. Complete setup on all contracts
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n15. Finalizing setup");
  const completions = [
    { name: "DEX", c: dex },
    { name: "IE", c: ie },
    { name: "Referral", c: ref },
    { name: "Rank", c: rank },
    { name: "Treasury", c: treasury },
    { name: "DAO", c: dao },
    { name: "OSLOToken", c: oslo },
    { name: "LM", c: lm },
  ];
  for (const { name, c } of completions) {
    try {
      let tx = await c.completeSetup();
      await tx.wait();
      console.log(`  ✓ ${name}.completeSetup()`);
    } catch (e: any) {
      if (e.message?.includes("SetupAlreadyComplete") || e.message?.includes("already")) {
        console.log(`  ✓ ${name} already finalized`);
      } else {
        console.log(`  ⚠ ${name}.completeSetup():`, e.message?.slice(0, 60));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("V3 REGISTRATION FIX DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log("MockUSDT:            ", USDT);
  console.log("OSLOToken:           ", OSLO);
  console.log("LiquidityManager:    ", LM_ADDR);
  console.log("OSLODEX:             ", DEX_ADDR);
  console.log("InvestmentEngine:    ", IE_ADDR);
  console.log("Referral:            ", REF_ADDR);
  console.log("RankSystem:          ", RANK_ADDR);
  console.log("Treasury:            ", TREASURY_ADDR);
  console.log("DAO:                 ", DAO_ADDR);
  console.log("═".repeat(60));

  console.log("\n// === contracts.ts snippet ===");
  console.log(`  osloToken:           "${OSLO}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine:    "${IE_ADDR}" as \`0x\${string}\`,`);
  console.log(`  referral:            "${REF_ADDR}" as \`0x\${string}\`,`);
  console.log(`  rankSystem:          "${RANK_ADDR}" as \`0x\${string}\`,`);
  console.log(`  dao:                 "${DAO_ADDR}" as \`0x\${string}\`,`);
  console.log(`  treasury:            "${TREASURY_ADDR}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager:    "${LM_ADDR}" as \`0x\${string}\`,`);
  console.log(`  osloDEX:             "${DEX_ADDR}" as \`0x\${string}\`,`);
  console.log(`  usdt:                "${USDT}" as \`0x\${string}\`,`);
}

main().catch(console.error);
