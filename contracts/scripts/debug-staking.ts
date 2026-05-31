import { ethers } from "hardhat";

const CONTRACTS = {
  osloToken: "0x8dCEF69fa6EEE38f9Da96c476522cA23c9C81521",
  investmentEngine: "0x6A659C970C4323E438b4c1eDd66B9933BE904e5B",
  referral: "0x1fdF55cDDaB9189F61cCDAe07C7d45Ac73C45241",
  rankSystem: "0xEA37db05d1fB3D304852eF2053fFF40aD77BCF70",
  osloDEX: "0x1d3b1442deE7072E414997bAa799CD6E9B10ddF5",
  usdt: "0x09d872c3573F134bc66F1FE4c38023ff6cf77D56",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Diagnosing staking issue from:", deployer.address);

  const usdt = await ethers.getContractAt("MockUSDT", CONTRACTS.usdt);
  const osloToken = await ethers.getContractAt("OSLOToken", CONTRACTS.osloToken);
  const dex = await ethers.getContractAt("OSLODEX", CONTRACTS.osloDEX);
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", CONTRACTS.investmentEngine);
  const referral = await ethers.getContractAt("OSLOReferral", CONTRACTS.referral);

  console.log("\n═══ DEX State ═══");
  const [usdtRes, osloRes] = await dex.getReserves();
  console.log("USDT Reserve:", ethers.formatEther(usdtRes));
  console.log("OSLO Reserve:", ethers.formatEther(osloRes));
  const dexOsloBal = await osloToken.balanceOf(CONTRACTS.osloDEX);
  console.log("DEX OSLO Token Balance:", ethers.formatEther(dexOsloBal));
  const dexUsdtBal = await usdt.balanceOf(CONTRACTS.osloDEX);
  console.log("DEX USDT Token Balance:", ethers.formatEther(dexUsdtBal));

  console.log("\n═══ InvestmentEngine State ═══");
  const ieOsloBal = await osloToken.balanceOf(CONTRACTS.investmentEngine);
  console.log("IE OSLO Balance:", ethers.formatEther(ieOsloBal));
  const ieUsdtBal = await usdt.balanceOf(CONTRACTS.investmentEngine);
  console.log("IE USDT Balance:", ethers.formatEther(ieUsdtBal));
  const depositsPaused = await ie.depositsPaused();
  console.log("Deposits Paused:", depositsPaused);
  const osloDex = await ie.osloDex();
  console.log("osloDex set to:", osloDex);
  const refAddr = await ie.referral();
  console.log("referral set to:", refAddr);
  const rankAddr = await ie.rankSystem();
  console.log("rankSystem set to:", rankAddr);
  const rwWallet = await ie.rewardWallet();
  const cwWallet = await ie.companyWallet();
  const pwWallet = await ie.performanceWallet();
  console.log("rewardWallet:", rwWallet);
  console.log("companyWallet:", cwWallet);
  console.log("performanceWallet:", pwWallet);

  console.log("\n═══ User State (deployer) ═══");
  const userUsdtBal = await usdt.balanceOf(deployer.address);
  console.log("USDT Balance:", ethers.formatEther(userUsdtBal));
  const allowance = await usdt.allowance(deployer.address, CONTRACTS.investmentEngine);
  console.log("USDT Allowance to IE:", ethers.formatEther(allowance));
  const isRegistered = await referral.isRegistered(deployer.address);
  console.log("Registered in Referral:", isRegistered);

  console.log("\n═══ Simulating Deposit of $10 USDT ═══");
  const depositAmt = ethers.parseEther("10");
  
  // Check requirements
  if (userUsdtBal < depositAmt) {
    console.log("❌ Insufficient USDT balance. Minting...");
    const tx = await usdt.mint(deployer.address, ethers.parseEther("1000"));
    await tx.wait();
    console.log("✅ Minted 1000 USDT");
  }

  // Ensure allowance
  if (allowance < depositAmt) {
    console.log("❌ Insufficient allowance. Approving...");
    const tx = await usdt.approve(CONTRACTS.investmentEngine, ethers.MaxUint256);
    await tx.wait();
    console.log("✅ Approved max USDT");
  }

  // Try the deposit
  try {
    console.log("\nAttempting deposit...");
    const tx = await ie.deposit(depositAmt);
    const receipt = await tx.wait();
    console.log("✅ Deposit successful! Gas used:", receipt?.gasUsed.toString());
  } catch (err: any) {
    console.log("❌ Deposit REVERTED!");
    console.log("Error:", err.message);
    if (err.data) {
      console.log("Error data:", err.data);
    }
    // Try to decode the error
    if (err.message.includes("DepositsPausedError")) console.log("→ Deposits are paused");
    if (err.message.includes("DepositTooLow")) console.log("→ Amount below $10 minimum");
    if (err.message.includes("NotConfigured")) console.log("→ osloDex not set");
    if (err.message.includes("InsufficientReserve")) console.log("→ DEX doesn't have enough OSLO");
    if (err.message.includes("ZeroAmount")) console.log("→ DEX calculated zero OSLO output");
    
    // Try static call to get more details
    try {
      await ie.deposit.staticCall(depositAmt);
    } catch (staticErr: any) {
      console.log("\nStatic call error details:", staticErr.message?.slice(0, 300));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
