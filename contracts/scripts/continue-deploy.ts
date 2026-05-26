import { ethers } from "hardhat";

// Already deployed (V4.1 partial):
const DEPLOYED = {
  usdt:    "0x5d0Dabc8957E2B2E2a5eAF8a13874830B53F7C9D",
  oslo:    "0xC155161f54c60C70f25a6Ca48C8764eFA60D7a46",
  lm:      "0xdFBdF8F156967Cf9662E2f4dD05A7Cc7C26a9d51",
  dex:     "0xa84E8D6326164320DF8C01Ee921C6111A5f25c0c",
  ie:      "0x55e52798156013783cB4605ACa3aF511db53AdBC",
  referral:"0x9978F2F2C49D1bF5A318D5Ec3b56776c959B8a7A",
};

const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer.address;
  const bal = await ethers.provider.getBalance(admin);
  console.log("Continue V4.1 deploy — resume from step 7");
  console.log("Deployer:", admin);
  console.log("Balance:", ethers.formatEther(bal), "BNB");

  // ═══════════════════════════════════════════════════════════════════
  // 7. OSLORankSystem
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n7. OSLORankSystem");
  const RANK = await ethers.getContractFactory("OSLORankSystem");
  const rank = await RANK.deploy(DEPLOYED.usdt);
  await rank.waitForDeployment();
  const RANK_ADDR = await rank.getAddress();
  console.log("  ", RANK_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 8. OSLOTreasury
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n8. OSLOTreasury");
  const TREASURY = await ethers.getContractFactory("OSLOTreasury");
  const treasury = await TREASURY.deploy(DEPLOYED.usdt, DEPLOYED.oslo);
  await treasury.waitForDeployment();
  const TREASURY_ADDR = await treasury.getAddress();
  console.log("  ", TREASURY_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 9. OSLODAO
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n9. OSLODAO");
  const DAO = await ethers.getContractFactory("OSLODAO");
  const dao = await DAO.deploy(DEPLOYED.usdt);
  await dao.waitForDeployment();
  const DAO_ADDR = await dao.getAddress();
  console.log("  ", DAO_ADDR);

  // ═══════════════════════════════════════════════════════════════════
  // 10. WIRE ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n10. Wiring");
  let tx;

  const lm = await ethers.getContractAt("OSLOLiquidityManager", DEPLOYED.lm);
  const dex = await ethers.getContractAt("OSLODEX", DEPLOYED.dex);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", DEPLOYED.ie);
  const ref = await ethers.getContractAt("OSLOReferral", DEPLOYED.referral);
  const oslo = await ethers.getContractAt("OSLOToken", DEPLOYED.oslo);
  const usdt = await ethers.getContractAt("MockUSDT", DEPLOYED.usdt);

  // LM.configure(timelock, dex)
  tx = await lm.configure(admin, DEPLOYED.dex);
  await tx.wait();
  console.log("  ✓ LM → DEX");

  // DEX.configure(timelock, lm, ie) + set referral
  tx = await dex.configure(admin, DEPLOYED.lm, DEPLOYED.ie);
  await tx.wait();
  tx = await dex.forceSetReferralContract(DEPLOYED.referral);
  await tx.wait();
  console.log("  ✓ DEX → LM + IE + Referral");

  // IE.configure(treasury, referral, rank, dex, timelock)
  tx = await ie.configure(TREASURY_ADDR, DEPLOYED.referral, RANK_ADDR, DEPLOYED.dex, admin);
  await tx.wait();
  console.log("  ✓ IE → Treasury + Referral + Rank + DEX");

  // Referral.configure(ie, dex, timelock)
  tx = await ref.configure(DEPLOYED.ie, DEPLOYED.dex, admin);
  await tx.wait();
  console.log("  ✓ Referral → IE + DEX");

  // RankSystem.configure(ie, referral, timelock)
  tx = await rank.configure(DEPLOYED.ie, DEPLOYED.referral, admin);
  await tx.wait();
  console.log("  ✓ Rank → IE + Referral");

  // Treasury.configure(rank, dao, lm, timelock)
  tx = await treasury.configure(RANK_ADDR, DAO_ADDR, DEPLOYED.lm, admin);
  await tx.wait();
  console.log("  ✓ Treasury → Rank + DAO + LM");

  // DAO.configure(timelock, ie)
  tx = await dao.configure(admin, DEPLOYED.ie);
  await tx.wait();
  console.log("  ✓ DAO → IE");

  // ═══════════════════════════════════════════════════════════════════
  // 11. OSLOToken config
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n11. OSLOToken config");
  tx = await oslo.setSellTaxAddresses(DEPLOYED.lm, DEPLOYED.ie);
  await tx.wait();

  const whitelist = [TREASURY_ADDR, DEPLOYED.lm, DEPLOYED.ie, DEPLOYED.referral, RANK_ADDR, DEPLOYED.dex, DAO_ADDR];
  for (const a of whitelist) {
    tx = await oslo.setTaxWhitelist(a, true);
    await tx.wait();
  }
  tx = await oslo.setSellEndpoint(DEPLOYED.dex, true);
  await tx.wait();
  console.log("  ✓", whitelist.length, "addresses whitelisted + DEX sell endpoint");

  // ═══════════════════════════════════════════════════════════════════
  // 12. OSLO allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n12. OSLO allocations");
  tx = await oslo.transfer(DEPLOYED.ie, ethers.parseEther("11000000"));
  await tx.wait();
  console.log("  ✓ 11,000,000 OSLO → IE");

  tx = await oslo.transfer(DEPLOYED.lm, ethers.parseEther("100000"));
  await tx.wait();
  console.log("  ✓ 100,000 OSLO → LM");

  // ═══════════════════════════════════════════════════════════════════
  // 13. Seed DEX
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n13. Seed DEX");
  tx = await usdt.mint(admin, ethers.parseEther("20000"));
  await tx.wait();
  console.log("  ✓ 20,000 USDT minted to deployer");

  const seedUsdt = ethers.parseEther("1000");
  tx = await usdt.transfer(DEPLOYED.lm, seedUsdt);
  await tx.wait();
  tx = await lm.addInitialLiquidity(seedUsdt);
  await tx.wait();
  const [rU, rO] = await dex.getReserves();
  console.log("  ✓ DEX seeded:", ethers.formatEther(rU), "USDT +", ethers.formatEther(rO), "OSLO");

  // ═══════════════════════════════════════════════════════════════════
  // 14. Root referral
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n14. Root referral");
  tx = await usdt.approve(DEPLOYED.referral, ethers.parseEther("1"));
  await tx.wait();
  tx = await ref.register(admin, ethers.ZeroAddress);
  await tx.wait();
  console.log("  ✓ deployer registered as root");

  // ═══════════════════════════════════════════════════════════════════
  // 15. Finalize
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n15. Finalizing setup");
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
  console.log("V4.1 DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log("MockUSDT:            ", DEPLOYED.usdt);
  console.log("OSLOToken:           ", DEPLOYED.oslo);
  console.log("LiquidityManager:    ", DEPLOYED.lm);
  console.log("OSLODEX:             ", DEPLOYED.dex);
  console.log("InvestmentEngine:    ", DEPLOYED.ie);
  console.log("Referral:            ", DEPLOYED.referral);
  console.log("RankSystem:          ", RANK_ADDR);
  console.log("Treasury:            ", TREASURY_ADDR);
  console.log("DAO:                 ", DAO_ADDR);
  console.log("minClaimThreshold:   $1 (default)");
  console.log("DEX referral swap:   ENABLED");
  console.log("═".repeat(60));

  console.log("\n// === contracts.ts snippet ===");
  console.log(`  osloToken:           "${DEPLOYED.oslo}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine:    "${DEPLOYED.ie}" as \`0x\${string}\`,`);
  console.log(`  referral:            "${DEPLOYED.referral}" as \`0x\${string}\`,`);
  console.log(`  rankSystem:          "${RANK_ADDR}" as \`0x\${string}\`,`);
  console.log(`  dao:                 "${DAO_ADDR}" as \`0x\${string}\`,`);
  console.log(`  treasury:            "${TREASURY_ADDR}" as \`0x\${string}\`,`);
  console.log(`  liquidityManager:    "${DEPLOYED.lm}" as \`0x\${string}\`,`);
  console.log(`  osloDEX:             "${DEPLOYED.dex}" as \`0x\${string}\`,`);
  console.log(`  usdt:                "${DEPLOYED.usdt}" as \`0x\${string}\`,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
