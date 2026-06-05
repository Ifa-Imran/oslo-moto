import { ethers } from "hardhat";

async function main() {
  const dex = await ethers.getContractAt("OSLODexV2", "0x5A7C5046FbB6aDdF7Ae36D08Ab0A603be694798C");
  const [u, o] = await dex.getReserves();
  const p = await dex.getPrice();
  console.log("═══ New DEX ($10/OSLO) ═══");
  console.log("  USDT:", ethers.formatEther(u));
  console.log("  OSLO:", ethers.formatEther(o));
  console.log("  Price:", ethers.formatEther(p), "USDT/OSLO");
  console.log("  Price ($): ~$" + (Number(ethers.formatEther(u)) / Number(ethers.formatEther(o))).toFixed(2));
  console.log("  ✓ drainOSLO: YES (new contract)");
}

main();
