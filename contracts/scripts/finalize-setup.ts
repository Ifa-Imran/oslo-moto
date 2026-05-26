import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Finalize Setup - calls completeSetup() on all contracts that haven't been finalized yet.
 * Run after deploy.ts if Step 14 partially failed.
 * 
 * npx hardhat run scripts/finalize-setup.ts --network bscMainnet
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Finalizing setup with account:", deployer.address);

  const addrPath = path.join(__dirname, "..", "data", "mainnet-addresses.json");
  if (!fs.existsSync(addrPath)) {
    console.error("mainnet-addresses.json not found. Run deploy.ts first.");
    process.exit(1);
  }

  const addrs = JSON.parse(fs.readFileSync(addrPath, "utf-8"));

  const contracts = [
    { name: "OSLODEX", address: addrs.OSLODEX },
    { name: "OSLOTreasury", address: addrs.OSLOTreasury },
    { name: "OSLOLiquidityManager", address: addrs.OSLOLiquidityManager },
    { name: "OSLODAO", address: addrs.OSLODAO },
    { name: "OSLORankSystem", address: addrs.OSLORankSystem },
    { name: "OSLOReferral", address: addrs.OSLOReferral },
    { name: "OSLOInvestmentEngine", address: addrs.OSLOInvestmentEngine },
  ];

  for (const c of contracts) {
    try {
      const contract = await ethers.getContractAt(c.name, c.address);
      const tx = await contract.completeSetup();
      await tx.wait();
      console.log(`✓ ${c.name} setup completed`);
    } catch (err: any) {
      if (err.message.includes("SetupAlreadyComplete") || err.message.includes("0x238f75d3")) {
        console.log(`⊘ ${c.name} - already complete (skipped)`);
      } else {
        console.error(`✗ ${c.name} - ERROR: ${err.message.slice(0, 100)}`);
      }
    }
  }

  console.log("\nAll contracts finalized!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
