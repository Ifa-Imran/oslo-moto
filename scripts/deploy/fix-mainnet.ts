import { ethers } from "hardhat";

/**
 * Post-deployment fix script for BSC mainnet.
 * Replicates two manual fixes that were done on testnet:
 * 1. Register 0x1d8896b5 (root user, no referrer in backup) with 0x47f8160e as referrer
 * 2. Add second stake of $979,999 for 0x1d8896b5 (to match old contract's $1,959,998)
 */

const REGISTRY_ADDR = "0x06cd1ADc500098f5cc65225D712CBF46939B2ee1";
const ENGINE_ADDR = "0x55bD08872d55fa6ac405fB3580c27740474cc4D9";

const WALLET_TO_FIX = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";
const REFERRER = "0x47f8160e3C854b4b4679579b99726E5E81736B7f";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing mainnet with account:", deployer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // 1. Register 0x1d8896b5 with 0x47f8160e as referrer
  console.log("\n--- 1. Register referral ---");
  const regAbi = [
    "function registerReferral(address, address) external",
    "function directReferrer(address) view returns (address)",
  ];
  const reg = new ethers.Contract(REGISTRY_ADDR, regAbi, deployer);

  // Check if already registered
  const existing = await reg.directReferrer(WALLET_TO_FIX);
  if (existing !== ethers.ZeroAddress) {
    console.log("Already registered with referrer:", existing);
  } else {
    console.log("Registering", WALLET_TO_FIX, "with referrer", REFERRER);
    const tx = await reg.registerReferral(WALLET_TO_FIX, REFERRER);
    await tx.wait();
    console.log("Registered! TX:", tx.hash);

    // Verify
    const ref = await reg.directReferrer(WALLET_TO_FIX);
    console.log("Verified - directReferrer:", ref);
  }

  // 2. Add second stake of $979,999 with 0 earnings
  console.log("\n--- 2. Add second stake ---");
  const engineAbi = [
    "function adminSeedStake(address, uint256, uint8, uint256) external",
    "function getTotalActiveStake(address) view returns (uint256)",
    "function totalActiveStakes() view returns (uint256)",
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, deployer);

  const stakeBefore = await engine.getTotalActiveStake(WALLET_TO_FIX);
  console.log("Current stake for wallet: $" + ethers.formatUnits(stakeBefore, 6));

  const amount = ethers.parseUnits("979999", 6);
  const tier = 2; // >= 2500
  const earnings = 0n; // 0 earnings to avoid doubling

  console.log("Adding second stake: $979,999, tier 2, 0 earnings");
  const tx2 = await engine.adminSeedStake(WALLET_TO_FIX, amount, tier, earnings);
  await tx2.wait();
  console.log("Stake added! TX:", tx2.hash);

  // Verify
  const stakeAfter = await engine.getTotalActiveStake(WALLET_TO_FIX);
  console.log("Stake after: $" + ethers.formatUnits(stakeAfter, 6));

  const totalStakes = await engine.totalActiveStakes();
  console.log("Total active stakes: $" + ethers.formatUnits(totalStakes, 6) + " USDT");

  console.log("\n=== FIX COMPLETE ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
