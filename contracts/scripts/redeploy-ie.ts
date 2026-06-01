import { ethers } from "hardhat";

// Existing contract addresses from testnet (latest deployment)
const EXISTING = {
  usdt: "0x887524926554F1e1A8Eeb3F99a0d9F6Bc9cd53dd",
  osloToken: "0x69E35319980F133612f39DD56616a46b5d7b8010",
  oldInvestmentEngine: "0x09c56236B863FA39c2F68BD8a97f5217f89571EF",
  osloDEX: "0x6e068cfd2D2878250c576aa70e1aCa64e58bEe1b",
  treasury: "0x244DbB6C084de7834e64c9e989550140580a5140",
  referral: "0xa2a5DCe18c64Ba420F824d6aE27bEFFB2B579EAa",
  rankSystem: "0x6B0863DD17D506a1BD2ac8e6BC113bAF632aa371",
  liquidityManager: "0xd80f3fa96A41f1f81c224167b83E00C06a422Caa",
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

  // Set reward wallets (2% deposit split)
  const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
  const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
  const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";
  tx = await newIE.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
  await tx.wait();
  console.log("Reward wallets set:", REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);

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

  // Route sell tax OSLO to new IE
  try {
    tx = await osloToken.setInvestmentEngine(newIEAddress);
    await tx.wait();
    console.log("OSLOToken.setInvestmentEngine → new IE (sell tax routing)");
  } catch (e: any) {
    console.log("OSLOToken.setInvestmentEngine skipped:", e.message?.slice(0, 80));
  }

  // ─── Transfer OSLO reserve to new IE ──────────────────────────
  console.log("\n--- OSLO Reserve Status ---");
  const oldIEBal = await osloToken.balanceOf(EXISTING.oldInvestmentEngine);
  console.log("Old IE OSLO balance:", ethers.formatEther(oldIEBal), "(locked — no rescue function)");

  // Transfer deployer's OSLO to new IE (if deployer has any)
  const deployerOsloBal = await osloToken.balanceOf(deployer.address);
  console.log("Deployer OSLO balance:", ethers.formatEther(deployerOsloBal));
  if (deployerOsloBal > 0n) {
    tx = await osloToken.transfer(newIEAddress, deployerOsloBal);
    await tx.wait();
    console.log("Transferred", ethers.formatEther(deployerOsloBal), "OSLO from deployer to new IE");
  }

  const newIEBal = await osloToken.balanceOf(newIEAddress);
  console.log("New IE OSLO balance:", ethers.formatEther(newIEBal));

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
