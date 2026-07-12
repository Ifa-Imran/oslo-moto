import { ethers } from "hardhat";

/**
 * Pauses the old V1 InvestmentEngine to prevent any new stakes/claims.
 * V1 remains on-chain as a read-only backup.
 *
 * Usage: npx hardhat run scripts/deploy/pause-v1-engine.ts --network bscMainnet
 */

const OLD_ENGINE = "0xDb18Ee516677A68284a76A5969138805670A1fD1";

const ENGINE_ABI = [
  "function pause() external",
  "function paused() view returns (bool)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Pausing V1 InvestmentEngine...");
  console.log(`  Engine: ${OLD_ENGINE}`);
  console.log(`  Deployer: ${deployer.address}`);

  const engine = new ethers.Contract(OLD_ENGINE, ENGINE_ABI, deployer);

  const alreadyPaused = await engine.paused();
  if (alreadyPaused) {
    console.log("  V1 engine is already paused — nothing to do.");
    return;
  }

  const tx = await engine.pause();
  console.log(`  Tx: ${tx.hash}`);
  await tx.wait();
  console.log("  V1 engine paused successfully.");
  console.log("  V1 is now read-only — no new stakes or claims possible.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
