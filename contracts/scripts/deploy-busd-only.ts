import { ethers } from "hardhat";

/**
 * Redeploy MockUSDT only — use when the faucet address in
 * frontend/src/lib/contracts.ts needs to be replaced.
 *
 * Run:
 *   npx hardhat run scripts/deploy-busd-only.ts --network bscTestnet
 *
 * After deployment, copy the printed address into:
 *   frontend/src/lib/contracts.ts  →  CONTRACTS.usdt
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance: ",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "BNB",
  );

  console.log("\nDeploying MockUSDT ...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();

  const address = await mockUSDT.getAddress();
  console.log("\n✓ MockUSDT deployed to:", address);
  console.log("\nPaste this into frontend/src/lib/contracts.ts:");
  console.log(`  usdt: "${address}" as \`0x\${string}\`,`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
