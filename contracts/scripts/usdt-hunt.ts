import { ethers } from "hardhat";

const USDT = "0x55d398326f99059fF775485246999027B3197955";

// All known contract addresses
const contracts: Record<string, string> = {
  "Vault (V3)": "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3",
  "Old IE": "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa",
  "DEX (current)": "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D",
  "DEX (original)": "0xCBa239e2aE0b7d84A156399ea1791C1Dd70b5e52",
  "Treasury": "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF",
  "LiqManager": "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E",
  "Referral": "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e",
  "RankSystem": "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C",
  "DAO": "0x708C360721baabb9FA982b37c79Fd3E21e374FEF",
  "OSLO Token": "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c",
  "Deployer": "0x47f8160e3C854b4b4679579b99726E5E81736B7f",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== USDT Hunt - Where is the $2.97M? ===\n");

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const usdt = new ethers.Contract(USDT, erc20, deployer);

  let totalFound = 0n;
  for (const [name, addr] of Object.entries(contracts)) {
    const bal = await usdt.balanceOf(addr);
    if (bal > 0n) {
      console.log(`  ${name} (${addr}): ${ethers.formatEther(bal)} USDT <<<`);
      totalFound += bal;
    } else {
      console.log(`  ${name}: 0`);
    }
  }

  console.log(`\nTotal found across known contracts: ${ethers.formatEther(totalFound)} USDT`);
  console.log("Missing: ~2,976,926 USDT");
}

main().catch(console.error);
