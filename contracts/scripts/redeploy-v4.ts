import { ethers } from "hardhat";

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  console.log("V4 FULL REDEPLOY — all contracts fresh");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(admin)), "BNB");

  // ═══════════════════════════════════════════════════════════════════
  // 1. MockUSDT
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n1. MockUSDT");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const USDT = await usdt.getAddress();
  console.log("  ", USDT);

  // ═══════════════════════════════════════════════════════════════════
  // 2. OSLOToken
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n2. OSLOToken");
  const OSLOToken = await ethers.getContractFactory("OSLOToken");
  const oslo = await OSLOToken.deploy();
  await oslo.waitForDeployment();
  const OSLO = await oslo.getAddress();
  console.log("  ", OSLO);

  // ═══════════════════════════════════════════════════════════════════
  // 3. OSLOLiquidityManager
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n3. OSLOLiquidityManager");
  const LM = await ethers.getContractFactory("OSLOLiquidityManager");
  const lm = await LM.deploy(USDT, OSLO);
  await lm.waitForDeployment();
  const LM_ADDR = await lm.getAddress();
  console.log("  ", LM_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 4. OSLODEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n4. OSLODEX");
  const DEX = await ethers.getContractFactory("OSLODEX");
  const dex = await DEX.deploy(USDT, OSLO);
  await dex.waitForDeployment();
  const DEX_ADDR = await dex.getAddress();
  console.log("  ", DEX_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 5. OSLOInvestmentEngine (minClaimThreshold=$1 by default)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n5. OSLOInvestmentEngine (minClaimThreshold=$1)");
  const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IE.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE_ADDR = await ie.getAddress();
  console.log("  ", IE_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 6. OSLOReferral
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n6. OSLOReferral");
  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT, OSLO);
  await ref.waitForDeployment();
  const REF_ADDR = await ref.getAddress();
  console.log("  ", REF_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 7. OSLORankSystem
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n7. OSLORankSystem");
  const RANK = await ethers.getContractFactory("OSLORankSystem");
  const rank = await RANK.deploy(USDT);
  await rank.waitForDeployment();
  const RANK_ADDR = await rank.getAddress();
  console.log("  ", RANK_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 8. OSLOTreasury
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n8. OSLOTreasury");
  const TREASURY = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await TREASURY.deploy(USDT, OSLO);
  await treasury.waitForDeployment();
  const TREASURY_ADDR = await treasury.getAddress();
  console.log("  ", TREASURY_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 9. OSLODAO
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n9. OSLODAO");
  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(USDT);
  await dao.waitForDeployment();
  const DAO_ADDR = await dao.getAddress();
  console.log("  ", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 10. WIRE ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n10. Wiring all contracts");
  let tx;

  // LM.configure(timelock, dex)
  tx = await lm.configure(admin, DEX_ADDR);
  await tx.wait();
  console.log("  ✓ LM → DEX");

  // DEX.configure(timelock, lm, ie)
  tx = await dex.configure(admin, LM_ADDR, IE_ADDR);
  await tx.wait();
  console.log("  ✓ DEX → LM + IE");

  // IE.configure(treasury, referral, rank, dex, timelock)
  tx = await ie.configure(TREASURY_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, admin);
  await tx.wait();
  console.log("  ✓ IE → Treasury + Referral + Rank + DEX");

  // Referral.configure(ie, dex, timelock)
  tx = await ref.configure(IE_ADDR, DEX_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Referral → IE + DEX");

  // RankSystem.configure(ie, referral, timelock)
  tx = await rank.configure(IE_ADDR, REF_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Rank → IE + Referral");

  // Treasury.configure(rank, dao, lm, timelock)
  tx = await treasury.configure(RANK_ADDR, DAO_ADDR, LM_ADDR, admin);
  await tx.wait();
  console.log("  ✓ Treasury → Rank + DAO + LM");

  // DAO.configure(timelock, ie)
  tx = await dao.configure(admin, IE_ADDR);
  await tx.wait();
  console.log("  ✓ DAO → IE");

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken setup (whitelists + sell endpoint)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n11. OSLOToken config");
  tx = await oslo.setSellTaxAddresses(LM_ADDR, IE_ADDR);
  await tx.wait();

  const whitelist = [TREASURY_ADDR, LM_ADDR, IE_ADDR, REF_ADDR, RANK_ADDR, DEX_ADDR, DAO_ADDR];
  for (const a of whitelist) {
    tx = await oslo.setTaxWhitelist(a, true);
    await tx.wait();
  }
  tx = await oslo.setSellEndpoint(DEX_ADDR, true);
  await tx.wait();
  console.log("  ✓", whitelist.length, "addresses whitelisted + DEX sell endpoint");

  // ═══════════════════════════════════════════════════════════════════
  // 12. Transfer OSLO allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n12. OSLO allocations");
  tx = await oslo.transfer(IE_ADDR, ethers.parseEther("11000000"));
  await tx.wait();
  console.log("  ✓ 11,000,000 OSLO → IE");

  tx = await oslo.transfer(LM_ADDR, ethers.parseEther("100000"));
  await tx.wait();
  console.log("  ✓ 100,000 OSLO → LM");

  // ═══════════════════════════════════════════════════════════════════
  // 13. Mint test USDT + Seed DEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n13. Seed DEX");
  tx = await usdt.mint(admin, ethers.parseEther("20000"));
  await tx.wait();
  console.log("  ✓ 20,000 USDT minted to deployer");

  const seedUsdt = ethers.parseEther("1000");
  tx = await usdt.transfer(LM_ADDR, seedUsdt);
  await tx.wait();
  tx = await lm.addInitialLiquidity(seedUsdt);
  await tx.wait();
  const [rU, rO] = await dex.getReserves();
  console.log("  ✓ DEX seeded:", ethers.formatEther(rU), "USDT +", ethers.formatEther(rO), "OSLO");
  console.log("  ✓ Deployer USDT balance:", ethers.formatEther(await usdt.balanceOf(admin)));

  // ═══════════════════════════════════════════════════════════════════
  // 14. Register root referral
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n14. Root referral");
  tx = await usdt.approve(REF_ADDR, ethers.parseEther("1"));
  await tx.wait();
  tx = await ref.register(admin, ethers.ZeroAddress);
  await tx.wait();
  console.log("  ✓ deployer registered as root");

  // ═══════════════════════════════════════════════════════════════════
  // 15. Complete setup on all contracts (renounce admin)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n15. Finalizing setup");
  // Note: DEX.configure already set setupComplete=true
  // Complete setup on contracts where configure() did NOT auto-finalize
  const completions = [
    { name: "IE", c: ie },
    { name: "Referral", c: ref },
    { name: "Rank", c: rank },
    { name: "Treasury", c: treasury },
    { name: "DAO", c: dao },
    { name: "OSLOToken", c: oslo },
  ];
  for (const { name, c } of completions) {
    tx = await c.completeSetup();
    await tx.wait();
    console.log(`  ✓ ${name}.completeSetup()`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("V4 FULL REDEPLOYMENT COMPLETE");
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
  console.log("minClaimThreshold:   $1 (default)");
  console.log("═".repeat(60));

  // Copy-paste ready contracts.ts snippet
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
