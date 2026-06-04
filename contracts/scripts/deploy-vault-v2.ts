import { ethers } from "hardhat";

/**
 * Deploy new consolidated OSLOVault, reconfigure DEX to point to it,
 * and transfer OSLO reserve from old vault to new one.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Existing V3 addresses
  const USDT_ADDR = "0x87025Ab074A1184802C056A2B8F2fFD8051A6c0f";
  const OSLO_TOKEN_ADDR = "0x4BF960c174cd7bd07D81ceCB23BBBd9b85C14CA4";
  const OSLO_DEX_ADDR = "0x7C927c151A258eCB262f548BbD07B12C37Ae797a";
  const OLD_VAULT_ADDR = "0xe188afCb1Dacd30Ca8BbF5F69dBf64b08b0136B8";

  // Use same launch timestamp as existing contract
  const LAUNCH_TIMESTAMP = 1778371200; // May 10, 2026 00:00:00 UTC (from OSLOConstants)

  // Reward wallets (same as before)
  const REWARD_WALLET = deployer.address;
  const COMPANY_WALLET = deployer.address;
  const PERF_WALLET = deployer.address;

  // 1. Deploy new OSLOVault (consolidated)
  console.log("\n1. Deploying new consolidated OSLOVault...");
  const VaultFactory = await ethers.getContractFactory("OSLOVault");
  const newVault = await VaultFactory.deploy(USDT_ADDR, OSLO_TOKEN_ADDR, LAUNCH_TIMESTAMP);
  await newVault.waitForDeployment();
  const newVaultAddr = await newVault.getAddress();
  console.log("   New OSLOVault:", newVaultAddr);

  // 2. Configure new vault
  console.log("\n2. Configuring new vault...");
  const tx1 = await newVault.configure(
    OSLO_DEX_ADDR,
    ethers.ZeroAddress, // referral (none for testnet)
    ethers.ZeroAddress, // rankSystem (none for testnet)
    deployer.address     // timelock = deployer for testnet
  );
  await tx1.wait();
  console.log("   Configured (dex, referral, rank, timelock)");

  // 3. Set reward wallets
  console.log("\n3. Setting reward wallets...");
  const tx2 = await newVault.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERF_WALLET);
  await tx2.wait();
  console.log("   Reward wallets set");

  // 4. Update DEX to point to new vault
  console.log("\n4. Updating DEX vault reference...");
  const dex = await ethers.getContractAt("OSLODexV2", OSLO_DEX_ADDR);
  const tx3 = await dex.setVault(newVaultAddr);
  await tx3.wait();
  console.log("   DEX vault updated to:", newVaultAddr);

  // 5. Transfer OSLO from old vault to new vault
  console.log("\n5. Transferring OSLO reserve to new vault...");
  const osloToken = await ethers.getContractAt("IERC20", OSLO_TOKEN_ADDR);
  const oldVaultBalance = await osloToken.balanceOf(OLD_VAULT_ADDR);
  console.log("   Old vault OSLO balance:", ethers.formatEther(oldVaultBalance));

  // The old vault doesn't have a withdrawal function for admin to pull OSLO.
  // We'll need to fund the new vault from deployer's balance or mint.
  // Check deployer's OSLO balance first
  const deployerOslo = await osloToken.balanceOf(deployer.address);
  console.log("   Deployer OSLO balance:", ethers.formatEther(deployerOslo));

  if (deployerOslo > 0n) {
    const transferAmount = deployerOslo > ethers.parseEther("10000000") ? ethers.parseEther("10000000") : deployerOslo;
    const tx4 = await osloToken.transfer(newVaultAddr, transferAmount);
    await tx4.wait();
    console.log("   Transferred", ethers.formatEther(transferAmount), "OSLO to new vault");
  } else {
    console.log("   WARNING: No OSLO available to transfer. Vault may need manual funding.");
  }

  // 6. Verify setup
  const newVaultOslo = await osloToken.balanceOf(newVaultAddr);
  console.log("\n6. Verification:");
  console.log("   New vault OSLO balance:", ethers.formatEther(newVaultOslo));
  console.log("   DEX vault reference:", await dex.vault());

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("New OSLOVault (consolidated):", newVaultAddr);
  console.log("\nUpdate frontend/src/lib/contracts.ts with:");
  console.log(`  osloVault:  "${newVaultAddr}" as \`0x\${string}\`,`);
  console.log(`  investmentEngine: "${newVaultAddr}" as \`0x\${string}\`,`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
