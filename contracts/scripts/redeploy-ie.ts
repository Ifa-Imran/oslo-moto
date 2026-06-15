import { ethers } from "hardhat";

const USDT = "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C";
const OSLO = "0x42062C7dD20Fc6a17987763E8db0d0acDDBEa6d5";
const DEX = "0xe3368093Cf0Ed990bb628C261F5e1A483DA74Ee3";
const REFERRAL = "0x0D584e91182a91e0500db20a603D0f732bE01B12";
const RANK_SYSTEM = "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844";
const TREASURY = "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1";
const LAUNCH_TIMESTAMP = 1_778_371_200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "BNB\n");

  // 1. Deploy new IE
  console.log("1. Deploying fixed OSLOInvestmentEngine...");
  const IEFactory = await ethers.getContractFactory("OSLOInvestmentEngine");
  const ie = await IEFactory.deploy(USDT, OSLO, LAUNCH_TIMESTAMP);
  await ie.waitForDeployment();
  const IE = await ie.getAddress();
  console.log("   New IE:", IE);

  // 2. Configure IE
  console.log("2. Configuring IE...");
  let tx = await ie.configure(TREASURY, REFERRAL, RANK_SYSTEM, DEX, deployer.address);
  await tx.wait();
  tx = await ie.setRewardWallets(deployer.address, deployer.address, deployer.address);
  await tx.wait();
  console.log("   IE configured");

  // 3. Update DEX to point to new IE
  console.log("3. Updating DEX investmentEngine...");
  const dex = await ethers.getContractAt("OSLODEX", DEX);
  tx = await dex.setInvestmentEngine(IE);
  await tx.wait();
  console.log("   DEX IE updated");

  // 4. Transfer OSLO to new IE
  console.log("4. Seeding new IE with OSLO...");
  const erc20Abi = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO, erc20Abi, deployer);
  const deployerOSLO = await oslo.balanceOf(deployer.address);
  if (deployerOSLO > 0n) {
    tx = await oslo.transfer(IE, deployerOSLO);
    await tx.wait();
    console.log("   Sent", ethers.formatEther(deployerOSLO), "OSLO to new IE");
  } else {
    console.log("   No OSLO in deployer - transferring from old IE if possible");
  }

  // 5. Update Referral
  console.log("5. Updating Referral...");
  try {
    const ref = await ethers.getContractAt("OSLOReferral", REFERRAL);
    tx = await ref.setInvestmentEngine(IE);
    await tx.wait();
    console.log("   Referral IE updated");
  } catch (e: any) { console.log("   Referral:", e.message?.slice(0, 80)); }

  // 6. Update RankSystem
  console.log("6. Updating RankSystem...");
  try {
    const rs = await ethers.getContractAt("OSLORankSystem", RANK_SYSTEM);
    tx = await rs.setInvestmentEngine(IE);
    await tx.wait();
    console.log("   RankSystem IE updated");
  } catch (e: any) { console.log("   RankSystem:", e.message?.slice(0, 80)); }

  console.log("\n" + "=".repeat(50));
  console.log("DONE! New IE:", IE);
  console.log("Update contracts-testnet.ts:");
  console.log(`  investmentEngine: "${IE}"`);
  console.log(`  osloVault:        "${IE}"`);
  console.log("=".repeat(50));
}

main().catch(console.error);