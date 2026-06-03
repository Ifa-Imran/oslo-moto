import { ethers } from "hardhat";

/**
 * OSLO Protocol V3 Deployment Script
 * 
 * Deploys the new architecture:
 * 1. OSLOTokenV2 — Simple ERC20 with burn (no built-in sell tax)
 * 2. OSLODexV2 — Sell-only DEX (10% USD tax, 50/50 burn/liquidity)
 * 3. OSLOVault — Staking engine (USDT deposits, OSLO reward payouts)
 * 
 * Initial liquidity: 100K OSLO + 2,000 USDT = $0.02/OSLO
 */

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying V3 contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

    // ─── Configuration ─────────────────────────────────────────────────
    // BSC Mainnet USDT address
    const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
    
    // Reward wallets (same as V2)
    const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
    const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
    const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";

    // Initial DEX liquidity
    const INITIAL_USDT = ethers.parseEther("2000");   // $2,000
    const INITIAL_OSLO = ethers.parseEther("100000"); // 100K tokens
    const VAULT_OSLO = ethers.parseEther("11000000"); // 11M tokens

    // Launch timestamp (same as V2)
    const LAUNCH_TIMESTAMP = 1_778_371_200; // May 10, 2026 00:00:00 UTC

    // ─── Step 1: Deploy OSLOTokenV2 ────────────────────────────────────
    console.log("\n─── Step 1: Deploying OSLOTokenV2... ───");
    const TokenV2Factory = await ethers.getContractFactory("OSLOTokenV2");
    const osloToken = await TokenV2Factory.deploy();
    await osloToken.waitForDeployment();
    const tokenAddress = await osloToken.getAddress();
    console.log("  OSLOTokenV2 deployed at:", tokenAddress);
    console.log("  Total supply:", ethers.formatEther(await osloToken.totalSupply()), "OSLO");

    // ─── Step 2: Deploy OSLODexV2 ──────────────────────────────────────
    console.log("\n─── Step 2: Deploying OSLODexV2... ───");
    const DexV2Factory = await ethers.getContractFactory("OSLODexV2");
    const osloDex = await DexV2Factory.deploy(USDT_ADDRESS, tokenAddress);
    await osloDex.waitForDeployment();
    const dexAddress = await osloDex.getAddress();
    console.log("  OSLODexV2 deployed at:", dexAddress);

    // ─── Step 3: Deploy OSLOVault ──────────────────────────────────────
    console.log("\n─── Step 3: Deploying OSLOVault... ───");
    const VaultFactory = await ethers.getContractFactory("OSLOVault");
    const osloVault = await VaultFactory.deploy(USDT_ADDRESS, tokenAddress, LAUNCH_TIMESTAMP);
    await osloVault.waitForDeployment();
    const vaultAddress = await osloVault.getAddress();
    console.log("  OSLOVault deployed at:", vaultAddress);

    // ─── Step 4: Configure OSLODexV2 ───────────────────────────────────
    console.log("\n─── Step 4: Configuring OSLODexV2... ───");
    const txDexCfg = await osloDex.configure(vaultAddress, deployer.address); // timelock = deployer for now
    await txDexCfg.wait();
    console.log("  DEX configured: vault =", vaultAddress);

    // ─── Step 5: Configure OSLOVault ───────────────────────────────────
    console.log("\n─── Step 5: Configuring OSLOVault... ───");
    const txVaultCfg = await osloVault.configure(
        dexAddress,
        ethers.ZeroAddress, // referral (set later if reusing existing)
        ethers.ZeroAddress, // rankSystem (set later)
        deployer.address    // timelock = deployer for now
    );
    await txVaultCfg.wait();
    console.log("  Vault configured: dex =", dexAddress);

    // Set reward wallets
    const txWallets = await osloVault.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
    await txWallets.wait();
    console.log("  Reward wallets set:", REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);

    // ─── Step 6: Transfer OSLO to Vault ────────────────────────────────
    console.log("\n─── Step 6: Transferring OSLO to Vault... ───");
    const txTransferVault = await osloToken.transfer(vaultAddress, VAULT_OSLO);
    await txTransferVault.wait();
    console.log("  Transferred", ethers.formatEther(VAULT_OSLO), "OSLO to Vault");

    // ─── Step 7: Add Initial Liquidity ─────────────────────────────────
    console.log("\n─── Step 7: Adding initial liquidity to DEX... ───");
    
    // Approve DEX to pull tokens from deployer
    const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);
    
    const txApproveUsdt = await usdt.approve(dexAddress, INITIAL_USDT);
    await txApproveUsdt.wait();
    console.log("  Approved USDT:", ethers.formatEther(INITIAL_USDT));

    const txApproveOslo = await osloToken.approve(dexAddress, INITIAL_OSLO);
    await txApproveOslo.wait();
    console.log("  Approved OSLO:", ethers.formatEther(INITIAL_OSLO));

    const txAddLiq = await osloDex.addInitialLiquidity(INITIAL_USDT, INITIAL_OSLO);
    await txAddLiq.wait();
    console.log("  Initial liquidity added: 2,000 USDT + 100,000 OSLO");

    // ─── Step 8: Verify ────────────────────────────────────────────────
    console.log("\n─── Step 8: Verification ───");
    const price = await osloDex.getPrice();
    console.log("  Initial OSLO price:", ethers.formatEther(price), "USDT");
    
    const [usdtRes, osloRes] = await osloDex.getReserves();
    console.log("  DEX USDT reserve:", ethers.formatEther(usdtRes));
    console.log("  DEX OSLO reserve:", ethers.formatEther(osloRes));
    console.log("  Vault OSLO balance:", ethers.formatEther(await osloToken.balanceOf(vaultAddress)));

    // ─── Summary ───────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  V3 DEPLOYMENT COMPLETE");
    console.log("═══════════════════════════════════════════════════");
    console.log("  OSLOTokenV2:", tokenAddress);
    console.log("  OSLODexV2:  ", dexAddress);
    console.log("  OSLOVault:  ", vaultAddress);
    console.log("  Initial Price: $0.02/OSLO");
    console.log("═══════════════════════════════════════════════════");

    // Save addresses
    const fs = require("fs");
    const addresses = {
        network: "bsc-mainnet",
        chainId: 56,
        deployer: deployer.address,
        contracts: {
            OSLOTokenV2: tokenAddress,
            OSLODexV2: dexAddress,
            OSLOVault: vaultAddress,
            USDT: USDT_ADDRESS,
        },
        rewardWallets: {
            reward: REWARD_WALLET,
            company: COMPANY_WALLET,
            performance: PERFORMANCE_WALLET,
        },
        initialLiquidity: {
            usdt: "2000",
            oslo: "100000",
            price: "0.02",
        },
        status: "deployed",
        timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
        "./data/mainnet-v3-addresses.json",
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n  Addresses saved to data/mainnet-v3-addresses.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
