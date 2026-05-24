import { ethers } from "hardhat";

// Addresses from the 2026-05-03 testnet deployment
const MOCK_BUSD = ethers.getAddress("0x9fa632fb341d9bab1b41764f0e5acbb90006aa9c");
const OSLO_TOKEN = ethers.getAddress("0xf148c173a06437a8fc14c3f4e951ab5984dde94b");
const REFERRAL = ethers.getAddress("0x3d75a9d613dc03958f8a6f1a04c0513c015b78c4");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Finishing registration with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const mockBusd = await ethers.getContractAt("MockBUSD", MOCK_BUSD);
  const osloToken = await ethers.getContractAt("OSLOToken", OSLO_TOKEN);
  const referral = await ethers.getContractAt("OSLOReferral", REFERRAL);

  // Step 1: Mint BUSD to deployer and approve Referral
  console.log("\n--- Minting BUSD & approving Referral ---");
  const busdBalance = await mockBusd.balanceOf(deployer.address);
  console.log("Current BUSD balance:", ethers.formatEther(busdBalance));

  if (busdBalance < ethers.parseEther("100")) {
    const tx = await mockBusd.mint(deployer.address, ethers.parseEther("10000"));
    await tx.wait();
    console.log("Minted 10,000 BUSD to deployer");
  } else {
    console.log("Already have sufficient BUSD");
  }

  const busdAllowance = await mockBusd.allowance(deployer.address, REFERRAL);
  if (busdAllowance < ethers.parseEther("5")) {
    const tx = await mockBusd.approve(REFERRAL, ethers.MaxUint256);
    await tx.wait();
    console.log("Approved Referral to spend BUSD");
  } else {
    console.log("Already approved BUSD");
  }

  // Step 2: Approve Referral to pull OSLO from deployer (earlyAdopterVault) for airdrops
  console.log("\n--- Approving Referral to spend OSLO from deployer ---");
  const osloAllowance = await osloToken.allowance(deployer.address, REFERRAL);
  console.log("Current OSLO allowance:", ethers.formatEther(osloAllowance));

  if (osloAllowance < ethers.parseEther("1322000")) {
    const tx = await osloToken.approve(REFERRAL, ethers.MaxUint256);
    await tx.wait();
    console.log("Approved MaxUint256 OSLO");
  } else {
    console.log("Already approved sufficient OSLO");
  }

  // Step 3: Register deployer as root referral
  console.log("\n--- Registering deployer as root referral ---");
  const isRegistered = (await referral.userInfo(deployer.address)).registered;
  if (isRegistered) {
    console.log("Deployer already registered");
  } else {
    const tx = await referral.register(deployer.address, ethers.ZeroAddress);
    await tx.wait();
    console.log("Deployer registered as root referral");
  }

  // Verify
  console.log("\n--- Verification ---");
  const totalRegistered = await referral.totalRegistered();
  console.log("Total registered users:", totalRegistered.toString());
  const deployerInfo = await referral.userInfo(deployer.address);
  console.log("Deployer registered:", deployerInfo.registered);
  console.log("Deployer referrer:", deployerInfo.referrer);
  console.log("\n✓ Registration finalized");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
