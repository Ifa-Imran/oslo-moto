import { ethers } from "hardhat";

// Hardcoded addresses from the current testnet deployment
const ADDR = {
  osloToken: "0x9847624e20B19fF06f58F58fC1bCc8979C529b54",
  investmentEngine: "0x93D9F1a0184228D0dd89Cefb904F92271f5E6564",
  osloDEX: "0x7C7fA3587e3E46A5c3Bb8878bb8c184435Ad4c18",
  referral: "0x7AaaF78F2d4d7BEc41fAd0fF1C4A470df1bC871c",
  usdt: "0x11E7d876139DC0dfdCE08Bd5cB199D5b25c0b434",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Diagnosing claim for:", deployer.address);
  console.log("");

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", ADDR.investmentEngine);
  const dex = await ethers.getContractAt("OSLODEX", ADDR.osloDEX);
  const oslo = await ethers.getContractAt("IERC20", ADDR.osloToken);
  const usdt = await ethers.getContractAt("IERC20", ADDR.usdt);
  const ref = await ethers.getContractAt("OSLOReferral", ADDR.referral);

  // 1. DEX reserves
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("1. DEX Reserves:");
  console.log("   USDT:", ethers.formatEther(usdtRes));
  console.log("   OSLO:", ethers.formatEther(osloRes));

  // 2. IE OSLO balance (for rewards)
  const ieOsloBal = await oslo.balanceOf(ADDR.investmentEngine);
  console.log("\n2. IE OSLO Balance:", ethers.formatEther(ieOsloBal));

  // 3. Deployer deposits
  const depositCount = await ie.getDepositCount(deployer.address);
  console.log("\n3. Deployer Deposits:", depositCount.toString());

  for (let i = 0; i < Number(depositCount); i++) {
    const dep = await ie.userDeposits(deployer.address, i);
    const pending = await ie.getPendingRewards(deployer.address, i);
    const now = Math.floor(Date.now() / 1000);
    const lastClaim = Number(dep.lastClaimTime);
    const timeElapsed = now - lastClaim;
    console.log(`\n   Deposit #${i}:`);
    console.log(`     Amount:     $${ethers.formatEther(dep.amount)}`);
    console.log(`     Active:     ${dep.active}`);
    console.log(`     Tier:       ${dep.tier}`);
    console.log(`     DailyRate:  ${dep.dailyRate} bp (${Number(dep.dailyRate)/100}%)`);
    console.log(`     LastClaim:  ${lastClaim} (${timeElapsed}s ago = ${(timeElapsed/3600).toFixed(2)}h)`);
    console.log(`     TotClaimed: $${ethers.formatEther(dep.totalClaimed)}`);
    console.log(`     MaxReturn:  $${ethers.formatEther(dep.maxReturn)}`);
    console.log(`     Pending:    $${ethers.formatEther(pending)}`);
    if (Number(pending) > 0) {
      const osloOut = await dex.getUSDTForOSLOOutput(pending);
      console.log(`     OSLO out:   ${ethers.formatEther(osloOut)} OSLO`);
      console.log(`     Threshold:  ${pending >= ethers.parseEther("10") ? "✓ MET" : "✗ BELOW $10"}`);
    } else {
      console.log(`     → NothingToClaim (pending=0)`);
    }
  }

  // 4. Referral registration
  const refInfo = await ref.userInfo(deployer.address);
  console.log("\n4. Referral Status:");
  console.log("   Registered:", refInfo.registered);
  console.log("   Referrer:", refInfo.referrer || "root");

  // 5. Check setupComplete
  const setup = await ie.setupComplete();
  console.log("\n5. IE Setup Complete:", setup);

  // 6. Check depositsPaused
  const paused = await ie.depositsPaused();
  console.log("   Deposits Paused:", paused);

  // 7. Total deposited
  const totalDep = await ie.totalDeposited();
  console.log("   Total Deposited:", ethers.formatEther(totalDep), "USDT");

  console.log("\n═══════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
