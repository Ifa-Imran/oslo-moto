import { ethers } from "hardhat";

/**
 * Set wallet addresses on the existing InvestmentEngine deployment:
 * - 1% company operations wallet
 * - 1% performance incentives wallet
 * - 2% reward wallet (sweep from vault, since setRewardWallet needs redeployment)
 *
 * For the 2% reward wallet: the deployed InvestmentEngine sends 2% USDT to the
 * RewardVault contract. We grant ENGINE_ROLE to the deployer on RewardVault,
 * then sweep all accumulated USDT to the reward wallet. For ongoing 2% to go
 * directly to the reward wallet, InvestmentEngine must be redeployed with the
 * new setRewardWallet() function (code is ready, just needs BNB for gas).
 */

// Existing deployed contract addresses (BSC Testnet)
const INVESTMENT_ENGINE = "0xA480c43072105648404a9Eb9E516F25C9b468FE9";
const REWARD_VAULT = "0x5e299472FF7DA8331465E95349a14d1aa1Be5750";

// Wallet addresses to set
const REWARD_WALLET = "0x1d8896b5A50F720e7ab811dCbfc68b6fE5FcF2b4";   // 2% reward
const COMPANY_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";  // 1% company
const PERF_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";     // 1% performance

// Minimal ABIs
const engineABI = [
  "function setCompanyWallet(address) external",
  "function setPerfWallet(address) external",
  "function companyWallet() view returns (address)",
  "function perfWallet() view returns (address)",
];
const vaultABI = [
  "function grantRole(bytes32, address) external",
  "function releaseUSDT(address, uint256) external",
  "function usdtBalance() view returns (uint256)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function ENGINE_ROLE() view returns (bytes32)",
  "function hasRole(bytes32, address) view returns (bool)",
];
const usdtABI = [
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting wallet addresses with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const engine = new ethers.Contract(INVESTMENT_ENGINE, engineABI, deployer);
  const vault = new ethers.Contract(REWARD_VAULT, vaultABI, deployer);

  // --- 1. Set company wallet ---
  console.log("\n1. Setting company wallet...");
  const currentCompany = await engine.companyWallet();
  console.log("   Current company wallet:", currentCompany);
  if (currentCompany.toLowerCase() !== COMPANY_WALLET.toLowerCase()) {
    const tx1 = await engine.setCompanyWallet(COMPANY_WALLET);
    console.log("   Tx sent:", tx1.hash);
    await tx1.wait();
    console.log("   Company wallet set to:", COMPANY_WALLET);
  } else {
    console.log("   Already set correctly, skipping.");
  }

  // --- 2. Set performance wallet ---
  console.log("\n2. Setting performance wallet...");
  const currentPerf = await engine.perfWallet();
  console.log("   Current perf wallet:", currentPerf);
  if (currentPerf.toLowerCase() !== PERF_WALLET.toLowerCase()) {
    const tx2 = await engine.setPerfWallet(PERF_WALLET);
    console.log("   Tx sent:", tx2.hash);
    await tx2.wait();
    console.log("   Performance wallet set to:", PERF_WALLET);
  } else {
    console.log("   Already set correctly, skipping.");
  }

  // --- 3. Sweep 2% USDT from RewardVault to reward wallet ---
  console.log("\n3. Sweeping 2% USDT from RewardVault to reward wallet...");
  const ENGINE_ROLE = await vault.ENGINE_ROLE();
  const hasRole = await vault.hasRole(ENGINE_ROLE, deployer.address);
  if (!hasRole) {
    console.log("   Granting ENGINE_ROLE to deployer on RewardVault...");
    const tx3 = await vault.grantRole(ENGINE_ROLE, deployer.address);
    console.log("   Tx sent:", tx3.hash);
    await tx3.wait();
    console.log("   ENGINE_ROLE granted.");
  } else {
    console.log("   Deployer already has ENGINE_ROLE on RewardVault.");
  }

  const vaultUSDTBalance = await vault.usdtBalance();
  console.log("   Vault USDT balance:", ethers.formatUnits(vaultUSDTBalance, 6), "USDT");
  if (vaultUSDTBalance > 0n) {
    console.log("   Sweeping to reward wallet:", REWARD_WALLET);
    const tx4 = await vault.releaseUSDT(REWARD_WALLET, vaultUSDTBalance);
    console.log("   Tx sent:", tx4.hash);
    await tx4.wait();
    console.log("   Swept", ethers.formatUnits(vaultUSDTBalance, 6), "USDT to reward wallet.");
  } else {
    console.log("   No USDT in vault to sweep.");
  }

  // --- Summary ---
  console.log("\n========================================");
  console.log("WALLET ADDRESSES CONFIGURED");
  console.log("========================================");
  console.log("2% Reward Wallet:      ", REWARD_WALLET);
  console.log("1% Company Wallet:     ", COMPANY_WALLET);
  console.log("1% Performance Wallet: ", PERF_WALLET);
  console.log("========================================");
  console.log("\nNOTE: The 2% USDT currently goes to the RewardVault contract.");
  console.log("The vault has been swept to the reward wallet.");
  console.log("For ongoing 2% to go directly to the reward wallet,");
  console.log("InvestmentEngine must be redeployed with setRewardWallet().");
  console.log("The contract code is ready — just needs BNB for deployment gas.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
