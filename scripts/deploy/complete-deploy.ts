import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Complete the partial deployment — fund LevelIncomeSystem from vault,
 * mint test USDT, and save deployment files.
 * Uses addresses from the just-deployed contracts.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Completing deployment with account:", deployer.address);

  // New addresses from the just-completed deployment
  const addresses = {
    MockUSDT: "0x745701dDF1724265B303438D407562711C58a82c",
    OsloToken: "0x2ed02111c02270D414AECca03b3e3DBaD944dF7C",
    OsloDEX: "0x0244e33C4a4Bf46108869e0935fdeeDF7B06DBf7",
    ReferralRegistry: "0xB93A3c54CBb4eB2eaA975A88876Efeb5e45F1152",
    RewardVault: "0x1aA36af41Da42b69FAFbFFaDe0dB2E26611325AE",
    LevelIncomeSystem: "0x9A1fE8fDFf5228aB3DDB6b92F0b32e159123D5ea",
    InvestmentEngine: "0xb0D471C2E8ab3E3AE8E52BFEF68447180846Cb16",
    OsloDAO: "0x2729837e8cEeddDee65359df42F0F5cd2e49d702",
    LeadershipBonus: "0xafC3A2bDB3f85C7E2B9F6431daed081bf3Ad034e",
  };

  const vault = await ethers.getContractAt("RewardVault", addresses.RewardVault);
  const usdt = await ethers.getContractAt("MockUSDT", addresses.MockUSDT);
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

  // 1. Fund LevelIncomeSystem with 500K OSLO from vault
  console.log("\n1. Funding LevelIncomeSystem with 500K OSLO from vault...");
  await vault.grantRole(ENGINE_ROLE, deployer.address);
  console.log("   Granted ENGINE_ROLE on vault to deployer");
  await vault.releaseOSLO(addresses.LevelIncomeSystem, ethers.parseEther("500000"));
  console.log("   Released 500K OSLO to LevelIncomeSystem");

  // 2. Mint test USDT to deployer
  console.log("\n2. Minting test USDT to deployer...");
  await usdt.mint(deployer.address, ethers.parseUnits("100000", 6));
  console.log("   Minted 100,000 test USDT to deployer");

  // 3. Save deployment files
  console.log("\n3. Saving deployment files...");
  const deploymentInfo = {
    network: "bscTestnet",
    chainId: 97,
    deployer: deployer.address,
    contracts: addresses,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("deployments-97.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("   Saved deployments-97.json");

  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "de1938e67e453d4ff13d1689f2262e43";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const envContent = `NEXT_PUBLIC_WC_PROJECT_ID=${wcProjectId}
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_USDT_ADDRESS=${addresses.MockUSDT}
NEXT_PUBLIC_OSLO_TOKEN_ADDRESS=${addresses.OsloToken}
NEXT_PUBLIC_OSLO_DEX_ADDRESS=${addresses.OsloDEX}
NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS=${addresses.InvestmentEngine}
NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS=${addresses.ReferralRegistry}
NEXT_PUBLIC_REWARD_VAULT_ADDRESS=${addresses.RewardVault}
NEXT_PUBLIC_OSLO_DAO_ADDRESS=${addresses.OsloDAO}
NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS=${addresses.LeadershipBonus}
`;
  fs.writeFileSync("frontend/.env.local", envContent);
  console.log("   Saved frontend/.env.local");

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("MockUSDT:         ", addresses.MockUSDT);
  console.log("OsloToken:        ", addresses.OsloToken);
  console.log("OsloDEX:          ", addresses.OsloDEX);
  console.log("ReferralRegistry: ", addresses.ReferralRegistry);
  console.log("RewardVault:      ", addresses.RewardVault);
  console.log("LevelIncomeSystem:", addresses.LevelIncomeSystem);
  console.log("InvestmentEngine: ", addresses.InvestmentEngine);
  console.log("OsloDAO:          ", addresses.OsloDAO);
  console.log("LeadershipBonus:  ", addresses.LeadershipBonus);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
