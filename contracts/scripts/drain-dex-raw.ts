import { ethers } from "hardhat";

/**
 * Drain USDT from OSLODEX using raw call to check if function exists in deployed bytecode
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const DEX_ADDR = "0xC583E5f125F312a35045B6Be1eDd729658C7A48B";
  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";

  const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDT_ADDR);

  // Check balance before
  const balBefore = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT before:", ethers.formatEther(balBefore));

  // Try raw call with drainUSDT(0) selector
  const iface = new ethers.Interface(["function drainUSDT(uint256 amount) external"]);
  const data = iface.encodeFunctionData("drainUSDT", [0]);
  console.log("\nFunction selector:", data.slice(0, 10));

  // Check if the contract has this function by doing a static call
  try {
    const result = await deployer.call({ to: DEX_ADDR, data });
    console.log("Static call result:", result);
  } catch (err: any) {
    console.log("Static call reverted:", err.message?.slice(0, 200));
  }

  // Now actually send the tx
  console.log("\nSending drain tx...");
  const tx = await deployer.sendTransaction({
    to: DEX_ADDR,
    data,
    gasPrice: ethers.parseUnits("1", "gwei"),
    gasLimit: 200000,
  });
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("tx status:", receipt?.status); // 1 = success, 0 = revert
  console.log("gas used:", receipt?.gasUsed.toString());
  console.log("logs count:", receipt?.logs.length);

  if (receipt?.logs && receipt.logs.length > 0) {
    for (const log of receipt.logs) {
      console.log("  log address:", log.address);
      console.log("  log topics:", log.topics);
      console.log("  log data:", log.data);
    }
  }

  // Check balance after
  const balAfter = await usdt.balanceOf(deployer.address);
  console.log("\nDeployer USDT after:", ethers.formatEther(balAfter));
  console.log("Received:", ethers.formatEther(balAfter - balBefore));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
