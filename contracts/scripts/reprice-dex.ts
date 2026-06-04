import { ethers } from "hardhat";

/**
 * Reprice OSLODEX to $10/OSLO.
 * 1. Drain all USDT & OSLO from old DEX
 * 2. Deploy new DEX (with drainOSLO function)
 * 3. Seed with 10,803 USDT + 1,080 OSLO → price = $10
 * 4. Update all contracts
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const OSLO_ADDR = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
  const VAULT_ADDR = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
  const REFERRAL_ADDR = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
  const IE_ADDR = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  // Old DEX (current, no drainOSLO)
  const OLD_DEX = "0x1a881a4bFD2E72c70667b8bD7bF77227a9f6Cf03";

  const usdt = await ethers.getContractAt("IERC20", USDT_ADDR);
  const oslo = await ethers.getContractAt("IERC20", OSLO_ADDR);

  // ─── Step 1: Check old DEX state ───
  const oldDex = await ethers.getContractAt("OSLODexV2", OLD_DEX);
  const [oldU, oldO] = await oldDex.getReserves();
  const oldPrice = await oldDex.getPrice();
  console.log("\n═══ Old DEX State ═══");
  console.log("  Address:", OLD_DEX);
  console.log("  USDT Reserve:", ethers.formatEther(oldU));
  console.log("  OSLO Reserve:", ethers.formatEther(oldO));
  console.log("  Price:", ethers.formatEther(oldPrice), "USDT/OSLO");

  // ─── Step 2: Drain old DEX ───
  console.log("\n── Step 2: Drain old DEX ──");

  // Drain all USDT
  console.log("  Draining USDT...");
  const drainU = await oldDex.drainUSDT(0);
  await drainU.wait();
  console.log("  ✓ USDT drained:", ethers.formatEther(oldU));

  // OSLO — old DEX doesn't have drainOSLO, but we keep it for later
  // The deployer already has 149K OSLO, so 17K locked in old DEX is acceptable loss
  // Wait — we now HAVE drainOSLO in the NEW contract, but old DEX was deployed BEFORE this change
  // Old DEX does NOT have drainOSLO. The OSLO there is permanently locked.
  // But we have enough OSLO in deployer wallet to seed the new DEX.
  
  const deployerOslo = await oslo.balanceOf(deployer.address);
  console.log("  Deployer OSLO balance:", ethers.formatEther(deployerOslo));
  console.log("  ℹ Old DEX has no drainOSLO — using deployer OSLO to seed new DEX");

  // ─── Step 3: Deploy new DEX ───
  console.log("\n── Step 3: Deploy new OSLODexV2 (with drainOSLO) ──");
  const OSLODexV2 = await ethers.getContractFactory("OSLODexV2");
  const newDex = await OSLODexV2.deploy(USDT_ADDR, OSLO_ADDR);
  await newDex.waitForDeployment();
  const newDexAddr = await newDex.getAddress();
  console.log("  ✓ Deployed at:", newDexAddr);

  // ─── Step 4: Configure vault ───
  console.log("\n── Step 4: Configure vault ──");
  const tx1 = await newDex.configure(VAULT_ADDR, deployer.address);
  await tx1.wait();
  console.log("  ✓ Vault:", VAULT_ADDR);

  // ─── Step 5: Seed with repriced liquidity ───
  // Price target: $10/OSLO
  // With ~10,803 USDT, we need 10,803/10 = 1,080.3 OSLO
  const TARGET_PRICE = 10;
  const seedUSDT = oldU; // All 10,803 USDT from old DEX
  const seedOSLO = ethers.parseEther("1081"); // Slightly above exact 1080.3 for safety

  const priceCheck = Number(ethers.formatEther(seedUSDT)) / Number(ethers.formatEther(seedOSLO));
  console.log("\n── Step 5: Seed liquidity (target: $" + TARGET_PRICE + "/OSLO) ──");
  console.log("  USDT:", ethers.formatEther(seedUSDT), "($", Number(ethers.formatEther(seedUSDT)).toLocaleString(), ")");
  console.log("  OSLO:", ethers.formatEther(seedOSLO));
  console.log("  Expected price: ~$" + priceCheck.toFixed(2), "/OSLO");

  // Approve both tokens
  const approveUsdt = await usdt.approve(newDexAddr, seedUSDT);
  await approveUsdt.wait();
  const approveOslo = await oslo.approve(newDexAddr, seedOSLO);
  await approveOslo.wait();
  console.log("  ✓ Approved USDT + OSLO");

  // Add initial liquidity
  const tx2 = await newDex.addInitialLiquidity(seedUSDT, seedOSLO);
  await tx2.wait();
  console.log("  ✓ Liquidity seeded");

  // Verify
  const [uRes, oRes] = await newDex.getReserves();
  const price = await newDex.getPrice();
  console.log("\n═══ New DEX State ═══");
  console.log("  USDT Reserve:", ethers.formatEther(uRes));
  console.log("  OSLO Reserve:", ethers.formatEther(oRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO");
  console.log("  Price ($): ~$" + (Number(ethers.formatEther(uRes)) / Number(ethers.formatEther(oRes))).toFixed(2));

  // ─── Step 6: Update all contracts ───
  console.log("\n── Step 6: Update contracts → new DEX ──");

  // Vault
  const vault = await ethers.getContractAt("OSLOVault", VAULT_ADDR);
  const vaultCfg = await vault.configure(
    await vault.investmentEngine(),
    newDexAddr,
    await vault.timelock()
  );
  await vaultCfg.wait();
  console.log("  ✓ Vault.osloDex →", newDexAddr);

  // Referral (direct — injectUSDTLiquidity is public)
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL_ADDR);
  const refCfg = await referral.configure(
    await referral.investmentEngine(),
    newDexAddr,
    await referral.timelock()
  );
  await refCfg.wait();
  console.log("  ✓ Referral.osloDex →", newDexAddr);

  // InvestmentEngine
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE_ADDR);
  const ieCfg = await ie.configure(
    newDexAddr,
    VAULT_ADDR,
    await ie.treasury(),
    await ie.timelock()
  );
  await ieCfg.wait();
  console.log("  ✓ IE.osloDex →", newDexAddr);

  // ─── Final Summary ───
  console.log("\n═══ REPRICE COMPLETE ═══");
  console.log("  New DEX:", newDexAddr);
  console.log("  USDT:", ethers.formatEther(uRes));
  console.log("  OSLO:", ethers.formatEther(oRes));
  console.log("  Price:", ethers.formatEther(price), "USDT/OSLO → ~$" + 
    (Number(ethers.formatEther(uRes)) / Number(ethers.formatEther(oRes))).toFixed(2) + "/OSLO");
  console.log("\n  Deployer OSLO remaining:", ethers.formatEther(await oslo.balanceOf(deployer.address)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
