import { ethers } from "hardhat";

async function main() {
  // Error data from the failed transaction
  const errorData = "0xfb8f41b200000000000000000000000022cda7ffff00965113e133b814447ba418d1cbab000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056bc75e2d63100000";
  
  console.log("=== DECODING ERROR DATA ===\n");
  
  // Extract error selector (first 4 bytes)
  const errorSelector = errorData.slice(0, 10);
  console.log("Error Selector:", errorSelector);
  
  // The rest is the encoded parameters
  const encodedParams = errorData.slice(10);
  console.log("Encoded Params:", encodedParams);
  console.log("");
  
  // Try to decode based on common patterns
  // Error format: error CustomError(address addr, uint256 amount)
  
  console.log("Decoding parameters:");
  console.log("- First 32 bytes (address padded):", encodedParams.slice(0, 64));
  console.log("- Second 32 bytes:", encodedParams.slice(64, 128));
  console.log("- Third 32 bytes:", encodedParams.slice(128, 192));
  console.log("");
  
  // Try to extract amount (last 32 bytes might be the amount)
  const last32Bytes = encodedParams.slice(-64);
  console.log("Last 32 bytes (hex):", last32Bytes);
  
  try {
    const amount = BigInt("0x" + last32Bytes);
    console.log("Amount (wei):", amount.toString());
    console.log("Amount (ether):", ethers.formatEther(amount));
  } catch (err) {
    console.log("Could not decode as amount");
  }
  
  console.log("\n=== ANALYSIS ===");
  console.log("The error selector 0xfb8f41b2 doesn't match standard errors.");
  console.log("This is a custom error from the contract.");
  console.log("\nLooking at OSLOInvestmentEngine.sol errors:");
  console.log("- DepositTooLow() - Line 71");
  console.log("- InvalidDeposit() - Line 73");
  console.log("- DepositCapped() - Line 74");
  console.log("\nThe deposit function checks:");
  console.log("1. if (depositsPaused) revert DepositsPausedError();");
  console.log("2. if (amount < OSLOConstants.TIER1_MIN) revert DepositTooLow();");
  console.log("   - TIER1_MIN = 10 * 1e18 = 10 BUSD");
  console.log("\nPossible causes:");
  console.log("❌ Amount being passed is 0 or very low");
  console.log("❌ The function call isn't passing the amount correctly");
  console.log("❌ There's a registration check we're missing");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
