import { ethers } from "hardhat";

async function main() {
  const IE = "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa";
  const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";

  // Check which contract has which functions
  const ieContract = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  const vaultAsIE = await ethers.getContractAt("OSLOInvestmentEngine", VAULT);

  console.log("═══ Which contract has InvestmentEngine functions? ═══\n");

  const tests = [
    { name: "totalDeposited", fn: "totalDeposited", args: [] },
    { name: "totalRewardsPaid", fn: "totalRewardsPaid", args: [] },
    { name: "depositsPaused", fn: "depositsPaused", args: [] },
    { name: "getActiveDeposit(deployer)", fn: "getActiveDeposit", args: ["0x47f8160e3C854b4b4679579b99726E5E81736B7f"] },
    { name: "getDepositCount(deployer)", fn: "getDepositCount", args: ["0x47f8160e3C854b4b4679579b99726E5E81736B7f"] },
    { name: "getUserTier(deployer)", fn: "getUserTier", args: ["0x47f8160e3C854b4b4679579b99726E5E81736B7f"] },
    { name: "claimRewards(0)", fn: "claimRewards", args: [0] },
  ];

  for (const t of tests) {
    // Test on actual IE
    try {
      await ieContract[t.fn].staticCall(...t.args);
      console.log(`IE.${t.name}: ✓`);
    } catch (e: any) {
      console.log(`IE.${t.name}: ✗ ${e.reason || e.shortMessage || e.message}`);
    }

    // Test on Vault (using IE ABI)
    try {
      await vaultAsIE[t.fn].staticCall(...t.args);
      console.log(`Vault.${t.name}: ✓`);
    } catch (e: any) {
      const msg = e.reason || e.shortMessage || e.message || "";
      console.log(`Vault.${t.name}: ✗ ${msg.slice(0, 80)}`);
    }
    console.log();
  }

  // Also check the Vault with its own ABI
  console.log("═══ Vault-native functions ═══\n");
  const vault = await ethers.getContractAt("OSLOVault", VAULT);
  try {
    const pool = await vault.userPools("0x47f8160e3C854b4b4679579b99726E5E81736B7f");
    console.log("Vault.userPools(deployer): active=", pool.active, "balance=", ethers.formatUnits(pool.totalBalance, 18));
  } catch (e: any) {
    console.log("Vault.userPools: ✗", e.reason || e.message);
  }

  // Check the IE with deposit data
  console.log("\n═══ IE Deposits for deployer ═══\n");
  try {
    const count = await ieContract.getDepositCount("0x47f8160e3C854b4b4679579b99726E5E81736B7f");
    console.log("Deposit count:", Number(count));
    const active = await ieContract.getActiveDeposit("0x47f8160e3C854b4b4679579b99726E5E81736B7f");
    console.log("Active deposit:", ethers.formatUnits(active, 18), "USDT");
    const total = await ieContract.totalDeposited();
    console.log("Total deposited:", ethers.formatUnits(total, 18), "USDT");
  } catch (e: any) {
    console.log("Error:", e.reason || e.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
