import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const bnb = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("BNB Balance:", ethers.formatEther(bnb));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
