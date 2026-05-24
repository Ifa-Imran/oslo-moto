import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing OSLODEX LiquidityManager configuration...");
  console.log("Deployer:", deployer.address);
  console.log("");

  const CONTRACTS = {
    osloDEX: "0x174192a51C4bf3dA0CD4b986e82C08B09183b6C0",
    liquidityManager: "0x265d1e39Cb82Da3839fBD819a813E9dE4a3271E2",
  };

  const OSLODEX = await ethers.getContractFactory("OSLODEX");
  const osloDEX = OSLODEX.attach(CONTRACTS.osloDEX);

  console.log("=== CHECKING OSLODEX CONFIG ===\n");

  // Try to get current liquidity manager
  try {
    const currentLM = await osloDEX.liquidityManager();
    console.log("Current LiquidityManager in OSLODEX:", currentLM);
    console.log("Expected:", CONTRACTS.liquidityManager);
    console.log("Match:", currentLM.toLowerCase() === CONTRACTS.liquidityManager.toLowerCase());
    console.log("");
    
    if (currentLM.toLowerCase() !== CONTRACTS.liquidityManager.toLowerCase()) {
      console.log("❌ MISMATCH! Reconfiguring...");
      const tx = await (osloDEX as any).configure(deployer.address, CONTRACTS.liquidityManager);
      await tx.wait();
      console.log("✅ Reconfigured!");
      
      const newLM = await osloDEX.liquidityManager();
      console.log("New LiquidityManager:", newLM);
    } else {
      console.log("✅ Configuration is correct");
      console.log("\nThe error must be elsewhere.");
    }
  } catch (err: any) {
    console.log("Error reading config:", err.message);
    console.log("\nAttempting to reconfigure anyway...");
    
    try {
      const tx = await (osloDEX as any).configure(deployer.address, CONTRACTS.liquidityManager);
      await tx.wait();
      console.log("✅ Configured!");
    } catch (err2: any) {
      console.log("Failed to configure:", err2.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
