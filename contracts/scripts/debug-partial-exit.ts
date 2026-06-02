import { ethers } from "hardhat";

const CONTRACTS = {
  investmentEngine: "0x3c6Ed5171E9021AE9fB94D1F077BaF7AF1e26b35",
  osloDEX: "0x6e068cfd2D2878250c576aa70e1aCa64e58bEe1b",
  osloToken: "0x69E35319980F133612f39DD56616a46b5d7b8010",
  usdt: "0x887524926554F1e1A8Eeb3F99a0d9F6Bc9cd53dd",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Debugger:", deployer.address);

  const ie = await ethers.getContractAt("OSLOInvestmentEngine", CONTRACTS.investmentEngine);
  const dex = await ethers.getContractAt("OSLODEX", CONTRACTS.osloDEX);
  const osloToken = await ethers.getContractAt("OSLOToken", CONTRACTS.osloToken);
  const usdt = await ethers.getContractAt("IERC20", CONTRACTS.usdt);

  // Check IE state
  console.log("\n--- Investment Engine State ---");
  const depositCount = await ie.getDepositCount(deployer.address);
  console.log("Deposit count:", depositCount.toString());

  if (depositCount === 0n) {
    console.log("No deposits found. Making a test deposit first...");
    // Approve USDT
    const amount = ethers.parseEther("100"); // $100 test
    const usdtBal = await usdt.balanceOf(deployer.address);
    console.log("USDT balance:", ethers.formatEther(usdtBal));
    
    if (usdtBal < amount) {
      console.log("Insufficient USDT. Minting...");
      const mockUsdt = await ethers.getContractAt("MockBUSD", CONTRACTS.usdt);
      await (await mockUsdt.mint(deployer.address, ethers.parseEther("10000"))).wait();
      console.log("Minted 10000 USDT");
    }
    
    await (await usdt.approve(CONTRACTS.investmentEngine, ethers.MaxUint256)).wait();
    console.log("Approved USDT");
    
    await (await ie.deposit(amount)).wait();
    console.log("Deposited $100");
  }

  // Check the active deposit
  const depIdx = Number(depositCount) > 0 ? Number(depositCount) - 1 : 0;
  console.log("\nChecking deposit index:", depIdx);
  
  const dep = await ie.userDeposits(deployer.address, depIdx);
  console.log("Deposit data:");
  console.log("  amount:", ethers.formatEther(dep[0]), "USDT");
  console.log("  tier:", dep[1].toString());
  console.log("  depositTime:", new Date(Number(dep[3]) * 1000).toISOString());
  console.log("  totalClaimed:", ethers.formatEther(dep[5]), "USDT");
  console.log("  active:", dep[7]);

  // Check early exit period
  const inEarlyExit = await ie.isInEarlyExitPeriod(deployer.address, depIdx);
  console.log("\nIn early exit period:", inEarlyExit);

  if (!inEarlyExit) {
    console.log("❌ Not in early exit period! Cannot test.");
    return;
  }

  // Check IE balances
  const ieUsdtBal = await usdt.balanceOf(CONTRACTS.investmentEngine);
  const ieOsloBal = await osloToken.balanceOf(CONTRACTS.investmentEngine);
  console.log("\nIE USDT balance:", ethers.formatEther(ieUsdtBal));
  console.log("IE OSLO balance:", ethers.formatEther(ieOsloBal));

  // Check DEX state
  const [dexUsdt, dexOslo] = await dex.getReserves();
  console.log("\nDEX reserves:");
  console.log("  USDT:", ethers.formatEther(dexUsdt));
  console.log("  OSLO:", ethers.formatEther(dexOslo));

  // Check DEX investmentEngine address
  const dexIE = await dex.investmentEngine();
  console.log("\nDEX.investmentEngine:", dexIE);
  console.log("Expected IE:", CONTRACTS.investmentEngine);
  console.log("Match:", dexIE.toLowerCase() === CONTRACTS.investmentEngine.toLowerCase());

  // Check OSLOToken whitelist status of IE
  const isWhitelisted = await osloToken.isTaxWhitelisted(CONTRACTS.investmentEngine);
  console.log("\nOSLO Token: IE tax whitelisted:", isWhitelisted);

  // Check if DEX is a sell endpoint
  const isSellEndpoint = await osloToken.isSellEndpoint(CONTRACTS.osloDEX);
  console.log("OSLO Token: DEX is sell endpoint:", isSellEndpoint);

  // Get early exit amounts for different percentages
  console.log("\n--- Early Exit Calculations ---");
  
  const exitData100 = await ie.getEarlyExitAmount(deployer.address, depIdx);
  console.log("100% exit: principal=", ethers.formatEther(exitData100[0]),
    "accrued=", ethers.formatEther(exitData100[1]),
    "fee=", ethers.formatEther(exitData100[2]),
    "net=", ethers.formatEther(exitData100[3]));

  const exitData50 = await ie.getPartialEarlyExitAmount(deployer.address, depIdx, 5000);
  console.log("50% exit: exitAmt=", ethers.formatEther(exitData50[0]),
    "fee=", ethers.formatEther(exitData50[1]),
    "net=", ethers.formatEther(exitData50[2]),
    "remaining=", ethers.formatEther(exitData50[3]));

  const exitData25 = await ie.getPartialEarlyExitAmount(deployer.address, depIdx, 2500);
  console.log("25% exit: exitAmt=", ethers.formatEther(exitData25[0]),
    "fee=", ethers.formatEther(exitData25[1]),
    "net=", ethers.formatEther(exitData25[2]),
    "remaining=", ethers.formatEther(exitData25[3]));

  // Calculate OSLO needed for withdrawal
  const netReturn50 = exitData50[2];
  if (netReturn50 > 0n) {
    const osloNeeded = await dex.getUSDTForOSLOOutput(netReturn50);
    console.log("\nOSLO needed for 50% exit:", ethers.formatEther(osloNeeded));
    console.log("IE has enough OSLO:", ieOsloBal >= osloNeeded);
  }

  // Try 50% partial exit via static call (simulation)
  console.log("\n--- Simulating 50% Partial Exit ---");
  try {
    await ie.partialEarlyExit.staticCall(depIdx, 5000);
    console.log("✅ 50% exit simulation PASSED!");
  } catch (err: any) {
    console.log("❌ 50% exit simulation FAILED!");
    console.log("Error:", err.message?.slice(0, 200));
    if (err.data) {
      console.log("Error data:", err.data);
      try {
        const iface = ie.interface;
        const decoded = iface.parseError(err.data);
        console.log("Decoded error:", decoded?.name, decoded?.args);
      } catch {}
    }
  }

  // Try 25% partial exit via static call
  console.log("\n--- Simulating 25% Partial Exit ---");
  try {
    await ie.partialEarlyExit.staticCall(depIdx, 2500);
    console.log("✅ 25% exit simulation PASSED!");
  } catch (err: any) {
    console.log("❌ 25% exit simulation FAILED!");
    console.log("Error:", err.message?.slice(0, 200));
    if (err.data) {
      console.log("Error data:", err.data);
    }
  }

  // Try actual 50% exit if simulation passed
  console.log("\n--- Attempting actual 50% Partial Exit ---");
  try {
    const tx = await ie.partialEarlyExit(depIdx, 5000);
    const receipt = await tx.wait();
    console.log("✅ 50% exit SUCCESS! TxHash:", receipt?.hash);
    console.log("Gas used:", receipt?.gasUsed.toString());
  } catch (err: any) {
    console.log("❌ 50% exit FAILED!");
    console.log("Error:", err.message?.slice(0, 300));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
