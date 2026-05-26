import { ethers } from "hardhat";

async function main() {
  const provider = ethers.provider;
  
  const DEX = "0x852B507aC97aAe3a9004eFD8505D7c987E6135Bb";
  const TOKEN = "0x5cF8A68fe39F4aC08BF258622D2a7c6BD3153285";

  const dexAbi = [
    "function getReserves() view returns (uint256, uint256)",
    "function getOSLOForUSDTOutput(uint256) view returns (uint256)",
    "function usdtReserve() view returns (uint256)",
    "function osloReserve() view returns (uint256)",
  ];
  const tokAbi = [
    "function isSellEndpoint(address) view returns (bool)",
    "function liquidityManager() view returns (address)",
    "function totalBurned() view returns (uint256)",
  ];

  const dex = new ethers.Contract(DEX, dexAbi, provider);
  const tok = new ethers.Contract(TOKEN, tokAbi, provider);

  const [rU, rO] = await dex.getReserves();
  console.log("DEX Reserves:", ethers.formatEther(rU), "USDT /", ethers.formatEther(rO), "OSLO");

  // Test: expected output for 100 OSLO (should account for 10% tax)
  const out100 = await dex.getOSLOForUSDTOutput(ethers.parseEther("100"));
  console.log("\ngetOSLOForUSDTOutput(100 OSLO):", ethers.formatEther(out100), "USDT");
  
  // Manual calc: netOslo=90 after tax, so (90 * usdtReserve) / (osloReserve + 90)
  const netOslo = ethers.parseEther("90"); // 90% of 100
  const manualOut = (netOslo * rU) / (rO + netOslo);
  console.log("Manual calc (90% tax-aware):", ethers.formatEther(manualOut), "USDT");
  
  // What OLD formula would give (without tax):
  const oldOut = (ethers.parseEther("100") * rU) / (rO + ethers.parseEther("100"));
  console.log("OLD formula (no tax):", ethers.formatEther(oldOut), "USDT");
  
  console.log("\nDifference (tax amount):", ethers.formatEther(oldOut - out100), "USDT =", 
    Number(ethers.formatEther((oldOut - out100) * 10000n / oldOut)) / 100, "%");

  // Verify token config
  const isSE = await tok.isSellEndpoint(DEX);
  const lm = await tok.liquidityManager();
  const burned = await tok.totalBurned();
  console.log("\n--- Token Config ---");
  console.log("isSellEndpoint[DEX]:", isSE);
  console.log("liquidityManager:", lm);
  console.log("totalBurned:", ethers.formatEther(burned), "OSLO");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
