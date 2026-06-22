import { ethers } from "hardhat";
import * as fs from "fs";

// Addresses from the latest BSC Testnet deployment
const ADDRESSES = {
  MockUSDT: "0xbaF4E803206eD79e0cab6b87967AD16f5EC32660",
  OsloToken: "0x8E6dAF6109377e77c8676b8848835964b5B46C2F",
  OsloDEX: "0xA1eEb2273fdb1Ba814e3172cd72d7E37197a9148",
  ReferralRegistry: "0x0808659B536fFd2212D8eeb32E768A7c0741d89a",
  RewardVault: "0x546fDa6FABA141059d55B38e4592D7969123B827",
  LevelIncomeSystem: "0xb59F43bC2BD65047bdE94A4437ADEd814C840A26",
  InvestmentEngine: "0x373655C0D5dd9ede2Af2f8874497aB89cCD2C5DE",
  OsloDAO: "0x7F8DA9cE672D3915fA585173E12864ACeDAE7BBB",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Wiring contracts with account:", deployer.address);

  const usdt = await ethers.getContractAt("MockUSDT", ADDRESSES.MockUSDT);
  const osloToken = await ethers.getContractAt("OsloToken", ADDRESSES.OsloToken);
  const osloDEX = await ethers.getContractAt("OsloDEX", ADDRESSES.OsloDEX);
  const registry = await ethers.getContractAt("ReferralRegistry", ADDRESSES.ReferralRegistry);
  const vault = await ethers.getContractAt("RewardVault", ADDRESSES.RewardVault);
  const levelSystem = await ethers.getContractAt("LevelIncomeSystem", ADDRESSES.LevelIncomeSystem);
  const engine = await ethers.getContractAt("InvestmentEngine", ADDRESSES.InvestmentEngine);
  const dao = await ethers.getContractAt("OsloDAO", ADDRESSES.OsloDAO);

  // Helper to execute tx only if not already done
  const executeIfNeeded = async (label: string, check: () => Promise<boolean>, action: () => Promise<any>) => {
    try {
      if (await check()) {
        console.log(`   ${label}: already done`);
        return;
      }
      const tx = await action();
      await tx.wait();
      console.log(`   ${label}: done`);
    } catch (e: any) {
      console.log(`   ${label}: ${e.message}`);
    }
  };

  console.log("\n1. Wiring permissions...");
  const BURNER_ROLE = await osloToken.BURNER_ROLE();
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const LEVEL_SYSTEM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LEVEL_SYSTEM_ROLE"));

  await executeIfNeeded(
    "Grant BURNER_ROLE to OsloDEX",
    () => osloToken.hasRole(BURNER_ROLE, ADDRESSES.OsloDEX),
    () => osloToken.grantRole(BURNER_ROLE, ADDRESSES.OsloDEX)
  );

  await executeIfNeeded(
    "Grant BURNER_ROLE to InvestmentEngine",
    () => osloToken.hasRole(BURNER_ROLE, ADDRESSES.InvestmentEngine),
    () => osloToken.grantRole(BURNER_ROLE, ADDRESSES.InvestmentEngine)
  );

  await executeIfNeeded(
    "Grant ENGINE_ROLE to InvestmentEngine on RewardVault",
    () => vault.hasRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine),
    () => vault.grantRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine)
  );

  await executeIfNeeded(
    "Grant ENGINE_ROLE to InvestmentEngine on ReferralRegistry",
    () => registry.hasRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine),
    () => registry.grantRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine)
  );

  await executeIfNeeded(
    "Grant ENGINE_ROLE to InvestmentEngine on LevelIncomeSystem",
    () => levelSystem.hasRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine),
    () => levelSystem.grantRole(ENGINE_ROLE, ADDRESSES.InvestmentEngine)
  );

  await executeIfNeeded(
    "Grant LEVEL_SYSTEM_ROLE to LevelIncomeSystem on InvestmentEngine",
    () => engine.hasRole(LEVEL_SYSTEM_ROLE, ADDRESSES.LevelIncomeSystem),
    () => engine.grantRole(LEVEL_SYSTEM_ROLE, ADDRESSES.LevelIncomeSystem)
  );

  await executeIfNeeded(
    "Set InvestmentEngine on LevelIncomeSystem",
    async () => (await levelSystem.investmentEngine()) === ADDRESSES.InvestmentEngine,
    () => levelSystem.setInvestmentEngine(ADDRESSES.InvestmentEngine)
  );

  await executeIfNeeded(
    "Set ReferralRegistry on OsloDAO",
    async () => (await dao.referralRegistry()) === ADDRESSES.ReferralRegistry,
    () => dao.setReferralRegistry(ADDRESSES.ReferralRegistry)
  );

  console.log("\n2. Transferring token reserves...");
  const vaultBalance = await osloToken.balanceOf(ADDRESSES.RewardVault);
  if (vaultBalance < ethers.parseEther("11000000")) {
    await (await osloToken.transfer(ADDRESSES.RewardVault, ethers.parseEther("11000000"))).wait();
    console.log("   Transferred 11M OSLO to RewardVault");
  } else {
    console.log("   RewardVault already funded");
  }

  const dexBalance = await osloToken.balanceOf(ADDRESSES.OsloDEX);
  if (dexBalance < ethers.parseEther("100000")) {
    await (await osloToken.transfer(ADDRESSES.OsloDEX, ethers.parseEther("100000"))).wait();
    console.log("   Transferred 100K OSLO to OsloDEX");
  } else {
    console.log("   OsloDEX already funded");
  }

  console.log("\n3. Seeding DEX liquidity...");
  const usdtReserve = await osloDEX.usdtReserve();
  if (usdtReserve === 0n) {
    await (await usdt.mint(ADDRESSES.OsloDEX, ethers.parseUnits("2000", 6))).wait();
    await (await osloDEX.seedLiquidity(ethers.parseUnits("2000", 6), ethers.parseEther("100000"))).wait();
    console.log("   Seeded DEX: 2000 USDT + 100K OSLO");
  } else {
    console.log("   DEX already seeded");
  }

  console.log("\n4. Minting test USDT to deployer...");
  const deployerBalance = await usdt.balanceOf(deployer.address);
  if (deployerBalance < ethers.parseUnits("100000", 6)) {
    await (await usdt.mint(deployer.address, ethers.parseUnits("100000", 6))).wait();
    console.log("   Minted 100,000 test USDT to deployer");
  } else {
    console.log("   Deployer already has test USDT");
  }

  console.log("\n========================================");
  console.log("TESTNET WIRING COMPLETE");
  console.log("========================================");

  // Save deployment info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const deploymentInfo = {
    network: chainId === 97 ? "bscTestnet" : "localhost",
    chainId: chainId,
    deployer: deployer.address,
    contracts: ADDRESSES,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`deployments-${chainId}.json`, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to deployments-${chainId}.json`);

  // Generate frontend .env.local
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo-project-id";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const envContent = `NEXT_PUBLIC_WC_PROJECT_ID=${wcProjectId}
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_USDT_ADDRESS=${ADDRESSES.MockUSDT}
NEXT_PUBLIC_OSLO_TOKEN_ADDRESS=${ADDRESSES.OsloToken}
NEXT_PUBLIC_OSLO_DEX_ADDRESS=${ADDRESSES.OsloDEX}
NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${ADDRESSES.InvestmentEngine}
NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS=${ADDRESSES.ReferralRegistry}
NEXT_PUBLIC_REWARD_VAULT_ADDRESS=${ADDRESSES.RewardVault}
NEXT_PUBLIC_OSLO_DAO_ADDRESS=${ADDRESSES.OsloDAO}
`;
  fs.writeFileSync("frontend/.env.local", envContent);
  console.log("Frontend .env.local generated!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
