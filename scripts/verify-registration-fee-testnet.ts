import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");

  const registryAddress = "0x0808659B536fFd2212D8eeb32E768A7c0741d89a";
  const osloDEXAddress = "0xA1eEb2273fdb1Ba814e3172cd72d7E37197a9148";
  const usdtAddress = "0xbaF4E803206eD79e0cab6b87967AD16f5EC32660";

  const registryAbi = [
    "function REGISTRATION_FEE() view returns (uint256)",
    "function usdt() view returns (address)",
    "function osloDEX() view returns (address)",
    "function isRegistered(address user) view returns (bool)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const registry = new ethers.Contract(registryAddress, registryAbi, provider);
  const usdt = new ethers.Contract(usdtAddress, erc20Abi, provider);

  console.log("=== BSC Testnet Registration Fee Verification ===");
  console.log("Registry address:", registryAddress);
  console.log("REGISTRATION_FEE:", ethers.formatUnits(await registry.REGISTRATION_FEE(), 6), "USDT");
  console.log("USDT token:", await registry.usdt());
  console.log("OsloDEX (fee destination):", await registry.osloDEX());
  console.log("OsloDEX USDT balance:", ethers.formatUnits(await usdt.balanceOf(osloDEXAddress), 6), "USDT");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
