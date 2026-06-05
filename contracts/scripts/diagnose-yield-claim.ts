import { ethers } from "hardhat";

const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const OSLO = "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c";
const DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Yield Claim Revert Diagnosis ===\n");

  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const oslo = new ethers.Contract(OSLO, erc20, deployer);

  const vaultAbi = [
    "function getPendingRewards(address) view returns (uint256)",
    "function userPools(address) view returns (uint256 totalBalance, uint256 totalClaimed, uint256 maxReturn, uint256 accruedRewards, uint256 lastClaimTime, uint256 lastDepositTime, uint256 totalCombinedEarnings, bool active)",
    "function minClaimThreshold() view returns (uint256)",
    "function referral() view returns (address)",
    "function osloDex() view returns (address)",
    "function claimRewards()",
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  const dexAbi = [
    "function getPrice() view returns (uint256)",
    "function getReserves() view returns (uint256, uint256)",
  ];
  const dex = new ethers.Contract(DEX, dexAbi, deployer);

  const refAbi = [
    "function investmentEngine() view returns (address)",
    "function isRegistered(address) view returns (bool)",
    "function userInfo(address) view returns (address referrer, uint256 unlockedLevels, uint256 totalEarned, bool registered)",
  ];
  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);

  // 1. Check basic state
  console.log("--- Contract State ---");
  const vaultRef = await vault.referral();
  const vaultDex = await vault.osloDex();
  const refIE = await ref.investmentEngine();
  console.log("Vault.referral:", vaultRef);
  console.log("Vault.osloDex: ", vaultDex);
  console.log("Ref.investmentEngine:", refIE, refIE.toLowerCase() === VAULT.toLowerCase() ? "✓" : "✗ WRONG");
  
  // 2. DEX state
  const price = await dex.getPrice();
  const reserves = await dex.getReserves();
  console.log("\n--- DEX State ---");
  console.log("Price:", ethers.formatEther(price), "USDT/OSLO", price === 0n ? "<<< WILL REVERT" : "✓");
  console.log("Reserves: USDT =", ethers.formatEther(reserves[0]), "| OSLO =", ethers.formatEther(reserves[1]));

  // 3. OSLO balances
  const vaultOslo = await oslo.balanceOf(VAULT);
  console.log("\n--- OSLO Balances ---");
  console.log("Vault:", ethers.formatEther(vaultOslo));

  // 4. Check deployer pool (deployer is likely testing)
  const testUser = deployer.address;
  console.log("\n--- Deployer Pool (", testUser, ") ---");
  const pool = await vault.userPools(testUser);
  console.log("totalBalance:", ethers.formatEther(pool.totalBalance));
  console.log("active:", pool.active);
  console.log("totalClaimed:", ethers.formatEther(pool.totalClaimed));
  console.log("maxReturn:", ethers.formatEther(pool.maxReturn));

  const pending = await vault.getPendingRewards(testUser);
  console.log("pendingRewards:", ethers.formatEther(pending));
  
  const minThreshold = await vault.minClaimThreshold();
  console.log("minClaimThreshold:", ethers.formatEther(minThreshold));

  if (pool.totalBalance === 0n) {
    console.log("\n⚠️ Deployer has NO deposits - would revert with NoBalance()");
  } else if (!pool.active) {
    console.log("\n⚠️ Pool is INACTIVE - would revert with PoolInactive()");
  } else if (pending === 0n) {
    console.log("\n⚠️ Pending rewards = 0 - would revert with NothingToClaim()");
  } else if (pending < minThreshold) {
    console.log("\n⚠️ Pending below threshold - would revert with BelowWithdrawalThreshold()");
  }

  // 5. Check the known large depositor
  const largeUser = ethers.getAddress("0x1d8896b5b5408fa0640cf942c17dded0c0992658");
  console.log("\n--- Large Depositor (", largeUser, ") ---");
  const lPool = await vault.userPools(largeUser);
  console.log("totalBalance:", ethers.formatEther(lPool.totalBalance));
  console.log("active:", lPool.active);
  const lPending = await vault.getPendingRewards(largeUser);
  console.log("pendingRewards:", ethers.formatEther(lPending));
  
  // Check if registered in referral
  const isReg = await ref.isRegistered(largeUser);
  console.log("isRegistered in Referral:", isReg);
  
  if (lPending > 0n && price > 0n) {
    const osloNeeded = (lPending * ethers.parseEther("1")) / price;
    console.log("OSLO needed for claim:", ethers.formatEther(osloNeeded));
    console.log("Vault has enough?", vaultOslo >= osloNeeded ? "YES ✓" : "NO <<<");
  }

  // 6. Try to simulate the claim call (will catch the actual error)
  console.log("\n--- Simulating claimRewards() for deployer ---");
  try {
    await vault.claimRewards.staticCall({ from: testUser });
    console.log("✓ Static call succeeded - claim would work!");
  } catch (e: any) {
    console.log("✗ REVERTED:", e.reason || e.message || e);
    if (e.data) console.log("  Error data:", e.data);
  }

  // 7. Try simulating for large depositor (using staticCallResult)
  console.log("\n--- Simulating claimRewards() for large depositor ---");
  try {
    const vaultAsUser = new ethers.Contract(VAULT, ["function claimRewards()"], deployer);
    // We can't impersonate on mainnet, but we can try eth_call with from override
    const iface = new ethers.Interface(["function claimRewards()"]);
    const calldata = iface.encodeFunctionData("claimRewards");
    const result = await deployer.provider.call({
      to: VAULT,
      data: calldata,
      from: largeUser,
    });
    console.log("✓ eth_call succeeded - claim would work for large depositor!");
  } catch (e: any) {
    console.log("✗ REVERTED:", e.reason || e.message || e);
    if (e.data) console.log("  Error data:", e.data);
  }
}

main().catch(console.error);
