import { ethers } from "hardhat";

/**
 * Fund LevelIncomeSystem with OSLO tokens from RewardVault.
 *
 * The LevelIncomeSystem needs OSLO to pay level commissions during yield claims.
 * It was never funded during initial deployment (only Vault and DEX received OSLO).
 * Since users couldn't claim yield before (seededEarnings bug), distributeCommissions
 * was never called. Now that claiming works, it needs OSLO.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/fund-level-system.ts --network bscMainnet
 */

const VAULT = "0x3A49898f23e610894F13F3D65484f557E627557f";
const LEVEL = "0x898095EaBe2C92ad78AbaA1a6ADa7b9346547861";
const OSLO = "0xCAACC067BD389597BD95A762436Feb723616Cab3";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding LevelIncomeSystem with OSLO...");
  console.log("Deployer:", deployer.address);

  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

  const roleABI = [
    "function grantRole(bytes32, address) external",
    "function revokeRole(bytes32, address) external",
    "function hasRole(bytes32, address) view returns (bool)",
  ];
  const vaultABI = [
    "function releaseOSLO(address to, uint256 amount) external",
  ];
  const erc20ABI = ["function balanceOf(address) view returns (uint256)"];

  const vaultC = new ethers.Contract(VAULT, [...roleABI, ...vaultABI], deployer);
  const tokenC = new ethers.Contract(OSLO, erc20ABI, deployer);

  // Check balances
  const vaultBal = await tokenC.balanceOf(VAULT);
  const levelBal = await tokenC.balanceOf(LEVEL);
  console.log("Vault OSLO:", ethers.formatUnits(vaultBal, 18));
  console.log("LevelIncomeSystem OSLO:", ethers.formatUnits(levelBal, 18));

  // Grant ENGINE_ROLE to deployer on vault
  console.log("\nGranting ENGINE_ROLE to deployer on vault...");
  await vaultC.grantRole(ENGINE_ROLE, deployer.address);
  console.log("Done.");

  // Transfer 500K OSLO from vault to LevelIncomeSystem
  const amount = ethers.parseUnits("500000", 18);
  console.log("Transferring 500,000 OSLO from vault to LevelIncomeSystem...");
  await vaultC.releaseOSLO(LEVEL, amount);
  console.log("Done.");

  // Revoke ENGINE_ROLE from deployer on vault
  console.log("Revoking ENGINE_ROLE from deployer on vault...");
  await vaultC.revokeRole(ENGINE_ROLE, deployer.address);
  console.log("Done.");

  // Verify
  const newLevelBal = await tokenC.balanceOf(LEVEL);
  const newVaultBal = await tokenC.balanceOf(VAULT);
  console.log("\n=== RESULTS ===");
  console.log("LevelIncomeSystem OSLO:", ethers.formatUnits(newLevelBal, 18));
  console.log("Vault OSLO:", ethers.formatUnits(newVaultBal, 18));
  console.log("Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
