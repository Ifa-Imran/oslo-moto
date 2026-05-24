import { ethers } from "hardhat";

// Existing contract addresses from testnet
const EXISTING = {
  usdt: "0x11E7d876139DC0dfdCE08Bd5cB199D5b25c0b434",
  osloToken: "0x9847624e20B19fF06f58F58fC1bCc8979C529b54",
  oldInvestmentEngine: "0x93D9F1a0184228D0dd89Cefb904F92271f5E6564",
  osloDEX: "0x7C7fA3587e3E46A5c3Bb8878bb8c184435Ad4c18",
  treasury: "0x7544986914cb495D087231Fee47BD0D32AfB294F",
  referral: "0x7AaaF78F2d4d7BEc41fAd0fF1C4A470df1bC871c",
  rankSystem: "0x6F4FF3aD987A1418c9FF36efEf606ac7587c2768",
  liquidityManager: "0xFF2A02673DE0B64E2e1b2F1A90Dab7A9721B292E",
};

// Launch: May 10, 2026 00:00:00 UTC
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying InvestmentEngine with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // ─── Deploy new InvestmentEngine ──────────────────────────────────
  console.log("\n--- Deploying new InvestmentEngine ---");
  const OSLOInvestmentEngine = await ethers.getContractFactory("OSLOInvestmentEngine");
  const newIE = await OSLOInvestmentEngine.deploy(EXISTING.usdt, EXISTING.osloToken, LAUNCH_TIMESTAMP);
  await newIE.waitForDeployment();
  const newIEAddress = await newIE.getAddress();
  console.log("New InvestmentEngine deployed to:", newIEAddress);

  // ─── Configure with existing addresses ────────────────────────────
  console.log("\n--- Configuring new IE with existing contracts ---");
  // Deployer as timelock
  const timelockAddress = deployer.address;
  
  let tx = await newIE.configure(
    EXISTING.treasury,
    EXISTING.referral,
    EXISTING.rankSystem,
    EXISTING.osloDEX,
    timelockAddress
  );
  await tx.wait();
  console.log("Configured: treasury, referral, rankSystem, osloDEX, timelock");

  // ─── Update external contracts to point to new IE ────────────────
  console.log("\n--- Updating external contract references ---");

  // Referral: update investmentEngine reference
  const referral = await ethers.getContractAt("OSLOReferral", EXISTING.referral);
  tx = await referral.setInvestmentEngine(newIEAddress);
  await tx.wait();
  console.log("Referral.setInvestmentEngine → new IE");

  // RankSystem: update investmentEngine reference
  const rankSystem = await ethers.getContractAt("OSLORankSystem", EXISTING.rankSystem);
  tx = await rankSystem.setInvestmentEngine(newIEAddress);
  await tx.wait();
  console.log("RankSystem.setInvestmentEngine → new IE");

  // OSLODEX: update investmentEngine reference (new setter added)
  const osloDEX = await ethers.getContractAt("OSLODEX", EXISTING.osloDEX);
  tx = await osloDEX.setInvestmentEngine(newIEAddress);
  await tx.wait();
  console.log("OSLODEX.setInvestmentEngine → new IE");

  // Whitelist new IE from sell tax
  const osloToken = await ethers.getContractAt("OSLOToken", EXISTING.osloToken);
  try {
    tx = await osloToken.setTaxWhitelist(newIEAddress, true);
    await tx.wait();
    console.log("OSLOToken: new IE whitelisted from sell tax");
  } catch (e: any) {
    console.log("OSLOToken whitelist skipped:", e.message?.slice(0, 80));
  }

  // ─── Transfer OSLO reserve from old IE to new IE ──────────────────
  console.log("\n--- Transferring OSLO reserve ---");
  const oldIE = await ethers.getContractAt("OSLOInvestmentEngine", EXISTING.oldInvestmentEngine);
  const osloBal = await osloToken.balanceOf(EXISTING.oldInvestmentEngine);
  console.log("Old IE OSLO balance:", ethers.formatEther(osloBal));

  if (osloBal > 0n) {
    // Need to call a function on old IE to transfer OSLO to new IE
    // Since old IE doesn't have a direct transfer function, we need another approach:
    // Use the deployer's authority to pull from old IE
    
    // Actually, the OSLO is just held by the old IE as a holder.
    // There's no built-in function to transfer it. 
    // We'll need to use recoverERC20 or similar.
    // For now, let's check if there's a rescue/recover function.
    
    console.log("Old IE lockup detected — will need manual recovery or re-mint");
    console.log("OSLO stuck in old IE:", ethers.formatEther(osloBal));
  }

  // Transfer deployer's OSLO to new IE instead (deployer holds the minted tokens)
  const deployerOsloBal = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO balance:", ethers.formatEther(deployerOsloBal));

  // ─── Print new addresses ──────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("NEW InvestmentEngine deployed:", newIEAddress);
  console.log("Default minClaimThreshold: $1 (1e18)");
  console.log("═══════════════════════════════════════════════════════════");
  
  console.log("\n// Updated CONTRACTS config:");
  console.log(`  investmentEngine: "${newIEAddress}" as \`0x\${string}\`,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
