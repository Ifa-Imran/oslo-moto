import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * OSLO Protocol V3 Testnet Deployment Script
 * 
 * Deploys the new V3 architecture on BSC Testnet with snapshot data migration:
 * 1. MockUSDT — Test USDT token
 * 2. OSLOTokenV2 — Simple ERC20 with burn
 * 3. OSLODexV2 — Sell-only DEX (10% USD tax, 50/50 burn/liquidity)
 * 4. OSLOVault — Staking engine (USDT deposits, OSLO reward payouts)
 * 5. Migrate snapshot deposits into Vault
 * 
 * Initial liquidity: 100K OSLO + 2,000 USDT = $0.02/OSLO
 */

interface SnapshotDeposit {
    owner: string;
    index: number;
    amount: string;
    tier: number;
    dailyRate: number;
    depositTime: number;
    lastClaimTime: number;
    totalClaimed: string;
    maxReturn: string;
    active: boolean;
}

interface Snapshot {
    network: string;
    chainId: number;
    totalRegistered: number;
    users: { address: string; referrer: string; unlockedLevels: number }[];
    deposits: SnapshotDeposit[];
}

const BATCH_SIZE = 50; // deposits per tx to avoid gas limits

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("═══════════════════════════════════════════════════");
    console.log("  OSLO V3 TESTNET DEPLOYMENT + MIGRATION");
    console.log("═══════════════════════════════════════════════════");
    console.log("  Deployer:", deployer.address);
    console.log("  Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

    // ─── Load Snapshot ───────────────────────────────────────────────────
    const snapshot: Snapshot = JSON.parse(fs.readFileSync("./data/testnet-snapshot.json", "utf-8"));
    console.log("\n  Snapshot loaded:");
    console.log("    Users:", snapshot.users.length);
    console.log("    Deposits:", snapshot.deposits.length);
    const totalValue = snapshot.deposits.reduce((s, d) => s + parseFloat(d.amount), 0);
    console.log("    Total deposit value: $" + totalValue.toLocaleString());

    // ─── Configuration ───────────────────────────────────────────────────
    // Reward wallets (same as mainnet)
    const REWARD_WALLET = "0xBAc7A17Fb7a60751629D19Cf4700730d232D0c56";
    const COMPANY_WALLET = "0xf2E281Af319a51066d3428A5Ffda46dAf0f1f5a4";
    const PERFORMANCE_WALLET = "0x3a39B26AFa950E13469854A836C1D033C39CeBF9";

    // Initial DEX liquidity
    const INITIAL_USDT = ethers.parseEther("2000");   // $2,000
    const INITIAL_OSLO = ethers.parseEther("100000"); // 100K tokens
    const VAULT_OSLO = ethers.parseEther("11000000"); // 11M tokens

    // Launch timestamp (already past for testnet - allow immediate deposits)
    const LAUNCH_TIMESTAMP = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    // ─── Step 1: Deploy MockUSDT ─────────────────────────────────────────
    console.log("\n─── Step 1: Deploying MockUSDT... ───");
    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const mockUsdt = await MockUSDTFactory.deploy();
    await mockUsdt.waitForDeployment();
    const usdtAddress = await mockUsdt.getAddress();
    console.log("  MockUSDT deployed at:", usdtAddress);

    // Mint USDT for deployer (for initial liquidity + testing)
    const mintAmount = ethers.parseEther("10000000"); // 10M USDT
    const txMint = await mockUsdt.mint(deployer.address, mintAmount);
    await txMint.wait();
    console.log("  Minted 10,000,000 USDT to deployer");

    // ─── Step 2: Deploy OSLOTokenV2 ──────────────────────────────────────
    console.log("\n─── Step 2: Deploying OSLOTokenV2... ───");
    const TokenV2Factory = await ethers.getContractFactory("OSLOTokenV2");
    const osloToken = await TokenV2Factory.deploy();
    await osloToken.waitForDeployment();
    const tokenAddress = await osloToken.getAddress();
    console.log("  OSLOTokenV2 deployed at:", tokenAddress);
    console.log("  Total supply:", ethers.formatEther(await osloToken.totalSupply()), "OSLO");

    // ─── Step 3: Deploy OSLODexV2 ────────────────────────────────────────
    console.log("\n─── Step 3: Deploying OSLODexV2... ───");
    const DexV2Factory = await ethers.getContractFactory("OSLODexV2");
    const osloDex = await DexV2Factory.deploy(usdtAddress, tokenAddress);
    await osloDex.waitForDeployment();
    const dexAddress = await osloDex.getAddress();
    console.log("  OSLODexV2 deployed at:", dexAddress);

    // ─── Step 4: Deploy OSLOVault ────────────────────────────────────────
    console.log("\n─── Step 4: Deploying OSLOVault... ───");
    const VaultFactory = await ethers.getContractFactory("OSLOVault");
    const osloVault = await VaultFactory.deploy(usdtAddress, tokenAddress, LAUNCH_TIMESTAMP);
    await osloVault.waitForDeployment();
    const vaultAddress = await osloVault.getAddress();
    console.log("  OSLOVault deployed at:", vaultAddress);

    // ─── Step 5: Configure OSLODexV2 ─────────────────────────────────────
    console.log("\n─── Step 5: Configuring OSLODexV2... ───");
    const txDexCfg = await osloDex.configure(vaultAddress, deployer.address);
    await txDexCfg.wait();
    console.log("  DEX configured: vault =", vaultAddress);

    // ─── Step 6: Configure OSLOVault ─────────────────────────────────────
    console.log("\n─── Step 6: Configuring OSLOVault... ───");
    const txVaultCfg = await osloVault.configure(
        dexAddress,
        ethers.ZeroAddress, // referral (none for testnet)
        ethers.ZeroAddress, // rankSystem (none for testnet)
        deployer.address    // timelock = deployer
    );
    await txVaultCfg.wait();
    console.log("  Vault configured: dex =", dexAddress);

    // Set reward wallets
    const txWallets = await osloVault.setRewardWallets(REWARD_WALLET, COMPANY_WALLET, PERFORMANCE_WALLET);
    await txWallets.wait();
    console.log("  Reward wallets set");

    // ─── Step 7: Transfer OSLO to Vault ──────────────────────────────────
    console.log("\n─── Step 7: Transferring OSLO to Vault... ───");
    const txTransferVault = await osloToken.transfer(vaultAddress, VAULT_OSLO);
    await txTransferVault.wait();
    console.log("  Transferred", ethers.formatEther(VAULT_OSLO), "OSLO to Vault");

    // ─── Step 8: Add Initial Liquidity ───────────────────────────────────
    console.log("\n─── Step 8: Adding initial liquidity to DEX... ───");

    const txApproveUsdt = await mockUsdt.approve(dexAddress, INITIAL_USDT);
    await txApproveUsdt.wait();
    console.log("  Approved USDT:", ethers.formatEther(INITIAL_USDT));

    const txApproveOslo = await osloToken.approve(dexAddress, INITIAL_OSLO);
    await txApproveOslo.wait();
    console.log("  Approved OSLO:", ethers.formatEther(INITIAL_OSLO));

    const txAddLiq = await osloDex.addInitialLiquidity(INITIAL_USDT, INITIAL_OSLO);
    await txAddLiq.wait();
    console.log("  Initial liquidity added: 2,000 USDT + 100,000 OSLO");

    // ─── Step 9: Verify Initial State ────────────────────────────────────
    console.log("\n─── Step 9: Verification ───");
    const price = await osloDex.getPrice();
    console.log("  Initial OSLO price:", ethers.formatEther(price), "USDT");

    const [usdtRes, osloRes] = await osloDex.getReserves();
    console.log("  DEX USDT reserve:", ethers.formatEther(usdtRes));
    console.log("  DEX OSLO reserve:", ethers.formatEther(osloRes));
    console.log("  Vault OSLO balance:", ethers.formatEther(await osloToken.balanceOf(vaultAddress)));

    // ─── Step 10: Migrate Snapshot Deposits ──────────────────────────────
    console.log("\n─── Step 10: Migrating snapshot deposits... ───");
    
    const activeDeposits = snapshot.deposits.filter(d => d.active);
    console.log("  Active deposits to migrate:", activeDeposits.length);

    let migrated = 0;
    for (let i = 0; i < activeDeposits.length; i += BATCH_SIZE) {
        const batch = activeDeposits.slice(i, i + BATCH_SIZE);
        
        const entries = batch.map(d => ({
            owner: d.owner,
            amount: ethers.parseEther(d.amount),
            tier: d.tier,
            dailyRate: d.dailyRate,
            depositTime: d.depositTime,
            lastClaimTime: d.lastClaimTime,
            totalClaimed: ethers.parseEther(d.totalClaimed),
            maxReturn: ethers.parseEther(d.maxReturn),
        }));

        const tx = await osloVault.migrateDeposits(entries);
        await tx.wait();
        migrated += batch.length;
        console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: migrated ${migrated}/${activeDeposits.length} deposits`);
    }

    // ─── Step 11: Migrate Combined Earnings ──────────────────────────────
    console.log("\n─── Step 11: Migrating combined earnings... ───");
    
    // Calculate total claimed per user from snapshot
    const earningsMap: Record<string, bigint> = {};
    for (const d of snapshot.deposits) {
        const claimed = ethers.parseEther(d.totalClaimed);
        if (claimed > 0n) {
            earningsMap[d.owner] = (earningsMap[d.owner] || 0n) + claimed;
        }
    }

    const earningUsers = Object.keys(earningsMap);
    if (earningUsers.length > 0) {
        const txEarnings = await osloVault.migrateCombinedEarnings(
            earningUsers,
            earningUsers.map(u => earningsMap[u])
        );
        await txEarnings.wait();
        console.log("  Migrated earnings for", earningUsers.length, "users");
    } else {
        console.log("  No earnings to migrate (all totalClaimed = 0)");
    }

    // ─── Step 12: Final Verification ─────────────────────────────────────
    console.log("\n─── Step 12: Final Verification ───");
    const finalTotalDeposited = await osloVault.totalDeposited();
    console.log("  Vault totalDeposited:", ethers.formatEther(finalTotalDeposited), "USDT");
    console.log("  Expected:", totalValue.toLocaleString(), "USDT");

    // ─── Summary ─────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  V3 TESTNET DEPLOYMENT + MIGRATION COMPLETE");
    console.log("═══════════════════════════════════════════════════");
    console.log("  MockUSDT:    ", usdtAddress);
    console.log("  OSLOTokenV2: ", tokenAddress);
    console.log("  OSLODexV2:   ", dexAddress);
    console.log("  OSLOVault:   ", vaultAddress);
    console.log("  Initial Price: $0.02/OSLO");
    console.log("  Deposits Migrated:", migrated);
    console.log("  Total Deposited: $" + ethers.formatEther(finalTotalDeposited));
    console.log("═══════════════════════════════════════════════════");

    // Save addresses
    const addresses = {
        network: "bsc-testnet",
        chainId: 97,
        deployer: deployer.address,
        contracts: {
            MockUSDT: usdtAddress,
            OSLOTokenV2: tokenAddress,
            OSLODexV2: dexAddress,
            OSLOVault: vaultAddress,
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
        migration: {
            snapshotFile: "testnet-snapshot.json",
            depositsCount: migrated,
            totalDeposited: ethers.formatEther(finalTotalDeposited),
        },
        status: "deployed",
        timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
        "./data/testnet-v3-addresses.json",
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n  Addresses saved to data/testnet-v3-addresses.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
