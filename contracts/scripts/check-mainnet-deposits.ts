import { ethers } from "hardhat";

async function main() {
  const ie = await ethers.getContractAt(
    "OSLOInvestmentEngine",
    "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa"
  );
  const addr = "0x8F9D25D72Fa8e742350AcBEAe76157e1A2916Df8";

  const count = await ie.getDepositCount(addr);
  const active = await ie.getActiveDeposit(addr);
  const userInfo = await ie.users(addr);

  console.log(`\n=== MAINNET STATE for ${addr} ===`);
  console.log(`depositCount: ${Number(count)}`);
  console.log(`getActiveDeposit: ${ethers.formatEther(active)} USDT`);
  console.log(`totalActiveDeposit (users mapping): ${ethers.formatEther(userInfo.totalActiveDeposit)} USDT`);
  console.log(`totalCombinedEarnings: ${ethers.formatEther(userInfo.totalCombinedEarnings)} USDT`);

  for (let i = 0; i < Number(count); i++) {
    const d = await ie.userDeposits(addr, i);
    let pending = "N/A";
    try {
      const p = await ie.getPendingRewards(addr, i);
      pending = ethers.formatEther(p);
    } catch {}
    console.log(
      `  dep[${i}] amount=${ethers.formatEther(d.amount)} active=${d.active} claimed=${ethers.formatEther(d.totalClaimed)} pending=${pending}`
    );
  }
}

main().catch(console.error);
