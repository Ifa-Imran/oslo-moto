import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Fund debug wallet and create a test team structure under it
 * Debug wallet: 0xbd632973e1353210D9f0b40461d8B876628F1E02
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const DEBUG_WALLET = "0xbd632973e1353210D9f0b40461d8B876628F1E02";

  const deployment = JSON.parse(fs.readFileSync("deployments-97.json", "utf8"));
  const addresses = deployment.contracts;

  const usdtFactory = await ethers.getContractFactory("MockUSDT");
  const engineFactory = await ethers.getContractFactory("InvestmentEngine");
  const registryFactory = await ethers.getContractFactory("ReferralRegistry");

  const usdt = usdtFactory.attach(addresses.MockUSDT) as any;
  const engine = engineFactory.attach(addresses.InvestmentEngine) as any;
  const registry = registryFactory.attach(addresses.ReferralRegistry) as any;

  // 1. Mint USDT to debug wallet
  console.log("\n1. Minting test USDT to debug wallet...");
  await usdt.mint(DEBUG_WALLET, ethers.parseUnits("10000", 6));
  console.log("   Minted 10,000 USDT to", DEBUG_WALLET);

  // 2. Create 3 test wallets, register them directly under debug wallet, and stake
  console.log("\n2. Creating test wallets under debug wallet...");
  const NUM_WALLETS = 1;
  for (let i = 0; i < NUM_WALLETS; i++) {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    console.log(`\n   Wallet ${i + 1}: ${wallet.address}`);

    // Fund with BNB for gas
    await deployer.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther("0.005"),
    });

    // Mint USDT
    await usdt.mint(wallet.address, ethers.parseUnits("200", 6));

    const usdtW = usdt.connect(wallet) as any;
    const engineW = engine.connect(wallet) as any;
    const registryW = registry.connect(wallet) as any;

    // Approve registry for $1 registration fee
    await usdtW.approve(addresses.ReferralRegistry, ethers.parseUnits("1", 6));
    // Self-register under debug wallet
    try {
      await registryW.register(DEBUG_WALLET);
      console.log(`   Wallet ${i + 1}: registered under debug wallet`);
    } catch (e: any) {
      console.log(`   Wallet ${i + 1}: register failed -`, e.message?.slice(0, 80));
    }

    // Approve engine for staking (max allowance to avoid issues)
    const approveTx2 = await usdtW.approve(addresses.InvestmentEngine, ethers.MaxUint256);
    await approveTx2.wait();
    // Stake 100 USDT Tier 1 with debug wallet as referrer
    try {
      await engineW.stake(ethers.parseUnits("100", 6), 1, DEBUG_WALLET);
      console.log(`   Wallet ${i + 1}: staked 100 USDT (Tier 1)`);
    } catch (e: any) {
      console.log(`   Wallet ${i + 1}: stake failed -`, e.message?.slice(0, 80));
    }
  }

  // 3. Check team stats for debug wallet
  console.log("\n3. Checking team stats for debug wallet...");
  const teamSize = await registry.getTeamSize(DEBUG_WALLET);
  const directCount = await registry.getDirectDownlineCount(DEBUG_WALLET);
  const teamVolume = await engine.getTeamVolume(DEBUG_WALLET);

  console.log("\n========================================");
  console.log("TEST TEAM SETUP COMPLETE");
  console.log("========================================");
  console.log("Debug wallet:", DEBUG_WALLET);
  console.log("Team size:", teamSize.toString());
  console.log("Direct legs:", directCount.toString());
  console.log("Team volume:", ethers.formatUnits(teamVolume, 6), "USDT");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
