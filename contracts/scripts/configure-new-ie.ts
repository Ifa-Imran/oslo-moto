import { ethers } from "hardhat";

const NEW_IE = "0xcB406995e635C577d22b66F71fD84e748eC67488";
const REFERRAL = "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";
const DEX = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
const TREASURY = "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Configuring new InvestmentEngine...\n");
  console.log("Deployer:", deployer.address);
  console.log("New IE:", NEW_IE);

  const newIE = await ethers.getContractAt("OSLOInvestmentEngine", NEW_IE);

  console.log("\nStep 1: Configure IE...");
  const tx1 = await newIE.configure(
    TREASURY.toLowerCase(),
    REFERRAL.toLowerCase(),
    RANK_SYSTEM.toLowerCase(),
    DEX.toLowerCase(),
    deployer.address
  );
  await tx1.wait();
  console.log("✅ Configuration complete");

  console.log("\nStep 2: Set reward wallets...");
  const tx2 = await newIE.setRewardWallets(
    "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56", // reward
    "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4", // company
    "0x3a39B26AFa950E13469854A836C1D033C39CeBF9"  // performance
  );
  await tx2.wait();
  console.log("✅ Reward wallets set");

  console.log("\nStep 3: Update RankSystem pointer...");
  const rankSystemContract = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
  const tx3 = await rankSystemContract.setInvestmentEngine(NEW_IE);
  await tx3.wait();
  console.log("✅ RankSystem updated");

  console.log("\nStep 4: Update DEX pointer...");
  const dexContract = await ethers.getContractAt("OSLODEX", DEX);
  const tx4 = await dexContract.setInvestmentEngine(NEW_IE);
  await tx4.wait();
  console.log("✅ DEX updated");

  console.log("\nStep 5: Update Referral pointer...");
  const referralContract = await ethers.getContractAt("OSLOReferral", REFERRAL);
  const setupComplete = await referralContract.setupComplete();
  
  if (!setupComplete) {
    const tx5 = await referralContract.configure(NEW_IE, DEX.toLowerCase(), deployer.address);
    await tx5.wait();
    console.log("✅ Referral updated via configure");
  } else {
    console.log("⚠️  Referral setupComplete = true, need timelock to update");
  }

  console.log("\n✅ ALL CONFIGURATION COMPLETE!");
  console.log("\nNew InvestmentEngine:", NEW_IE);
  console.log("\nUpdate frontend src/lib/contracts.ts with this address!");
}

main().catch(console.error);
