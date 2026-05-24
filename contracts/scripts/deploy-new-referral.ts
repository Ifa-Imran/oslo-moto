import { ethers } from "hardhat";

// Existing contract addresses (from V2 fixed deployment)
const USDT = "0x45EB9427827a2Cc1C1ed666810165703DA6edB73";
const TOKEN = "0x6831B62cC403E77249Da1129BF668Bd7339A001f";
const DEX = "0x6c227f682F8D9059bb90fED700e05EEf896Bc9C2";
const IE = "0x5a7FBeEbcB930D2541B2CE7F26c3A824374fE5d5";
const DAO = "0xd950F6264Aeaa35Aea4AcdE233ba222a941f9880";
const RS = "0x8B10a3F71D45bBc16bbD2d42Cc583A6cb675Cadc";

async function main() {
  const [deployer] = await ethers.getSigners();
  const timelockAddress = deployer.address;

  console.log("═".repeat(60));
  console.log("OSLO Protocol — Deploy New Referral ($1 Registration Fee)");
  console.log("═".repeat(60));
  console.log("Deployer:", deployer.address);

  // ─── Step 1: Deploy new OSLOReferral ──────────────────────────────
  console.log("\n--- Step 1: Deploying new OSLOReferral ---");
  const REF = await ethers.getContractFactory("OSLOReferral");
  const ref = await REF.deploy(USDT, TOKEN);
  await ref.waitForDeployment();
  const REF_ADDR = await ref.getAddress();
  console.log("New OSLOReferral:", REF_ADDR);

  // ─── Step 2: Configure new Referral ───────────────────────────────
  console.log("\n--- Step 2: Configuring new Referral ---");
  let tx = await ref.configure(IE, DEX, timelockAddress);
  await tx.wait();
  console.log("Referral configured (IE, DEX, timelock)");

  // Complete setup
  tx = await ref.completeSetup();
  await tx.wait();
  console.log("Referral setup complete (admin renounced)");

  // ─── Step 3: Update IE to point to new Referral ───────────────────
  console.log("\n--- Step 3: Updating IE referral address ---");
  const ie = await ethers.getContractAt("OSLOInvestmentEngine", IE);
  tx = await ie.setReferral(REF_ADDR);
  await tx.wait();
  console.log("IE referral updated →", REF_ADDR);

  // ─── Step 4: Update RankSystem to point to new Referral ────────────
  // RankSystem constructor takes (address _usdt), configure(IE, REF, timelock)
  // RS has a `referral` state var set in configure. We need to update it.
  // Check if RS has a setter...
  console.log("\n--- Step 4: Checking RankSystem referral ---");
  const rs = await ethers.getContractAt("OSLORankSystem", RS);
  // Try to call configure again — may fail if already setup
  try {
    tx = await rs.configure(IE, REF_ADDR, timelockAddress);
    await tx.wait();
    console.log("RankSystem referral updated →", REF_ADDR);
  } catch (e: any) {
    console.log("RankSystem configure failed (likely already setup):", e.message?.slice(0, 80));
    console.log("Note: RankSystem still points to old referral. Redeploy RS if needed.");
  }

  // ─── Step 5: Register deployer as root ────────────────────────────
  console.log("\n--- Step 5: Registering deployer as root ---");
  try {
    tx = await ref.register(deployer.address, ethers.ZeroAddress);
    await tx.wait();
    console.log("Deployer registered as root (with $1 fee)");
  } catch (e: any) {
    console.log("Register root failed (may already be registered):", e.message?.slice(0, 80));
  }

  // ─── Verify ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("Referral Upgrade Complete!");
  console.log("═".repeat(60));
  console.log("New OSLOReferral:", REF_ADDR);
  console.log("IE referral pointer:", await ie.referral());
  console.log("═".repeat(60));
  console.log("\nUpdate contracts.ts:");
  console.log(`  referral: "${REF_ADDR}" as \`0x\${string}\`,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
