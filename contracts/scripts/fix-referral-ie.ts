import { ethers } from "hardhat";

const REFERRAL = "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e";
const VAULT = "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3";
const CURRENT_DEX = "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D";
const CURRENT_TIMELOCK = ethers.ZeroAddress; // Will read from contract

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Fix Referral investmentEngine → Vault ===");
  console.log("Deployer:", deployer.address);

  const refAbi = [
    "function investmentEngine() external view returns (address)",
    "function osloDex() external view returns (address)",
    "function timelock() external view returns (address)",
    "function admin() external view returns (address)",
    "function setupComplete() external view returns (bool)",
    "function configure(address _investmentEngine, address _osloDex, address _timelock) external",
  ];

  const ref = new ethers.Contract(REFERRAL, refAbi, deployer);

  // Read current state
  const admin = await ref.admin();
  const setupComplete = await ref.setupComplete();
  const currentIE = await ref.investmentEngine();
  const currentDex = await ref.osloDex();
  const currentTimelock = await ref.timelock();

  console.log("\nCurrent state:");
  console.log("  admin:            %s", admin);
  console.log("  setupComplete:    %s", setupComplete);
  console.log("  investmentEngine: %s", currentIE);
  console.log("  osloDex:          %s", currentDex);
  console.log("  timelock:         %s", currentTimelock);

  if (currentIE === VAULT) {
    console.log("\n✓ Already fixed — investmentEngine already points to Vault");
    return;
  }

  if (admin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("\n✗ Deployer is NOT admin. Admin is:", admin);
    console.log("  Cannot call configure(). Need timelock to call setInvestmentEngine().");
    return;
  }

  if (setupComplete) {
    console.log("\n✗ setupComplete = true. Admin cannot call configure().");
    console.log("  Need timelock to call setInvestmentEngine().");
    return;
  }

  console.log("\n✓ Admin confirmed, setupComplete = false — can call configure()");
  console.log("\nCalling configure(%s, %s, %s)...", VAULT, currentDex, currentTimelock);

  const tx = await ref.configure(VAULT, currentDex, currentTimelock);
  console.log("  Tx hash:", tx.hash);
  await tx.wait();
  console.log("  Confirmed!");

  // Verify
  const newIE = await ref.investmentEngine();
  console.log("\n  New investmentEngine: %s %s",
    newIE,
    newIE === VAULT ? "✓" : "✗ FAILED!");
}

main().catch(console.error);
