import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");
  const contract = new ethers.Contract(
    "0x3A49898f23e610894F13F3D65484f557E627557f",
    [
      "function isRegistered(address user) view returns (bool)",
      "function directReferrer(address user) view returns (address)",
    ],
    provider
  );

  const testAddresses = [
    "0xb259fcC202b17C124201C872c52f108ade380B4F", // deployer
    "0x0000000000000000000000000000000000000000", // zero
    "0x0000000000000000000000000000000000000123", // random
  ];

  for (const addr of testAddresses) {
    try {
      const isReg = await contract.isRegistered(addr);
      const directRef = await contract.directReferrer(addr);
      console.log(`Address ${addr}:`);
      console.log(`  isRegistered: ${isReg}`);
      console.log(`  directReferrer: ${directRef}`);
    } catch (e: any) {
      console.log(`Address ${addr} - ERROR: ${e.message}`);
    }
  }

  // Also verify contract code exists
  const code = await provider.getCode("0x3A49898f23e610894F13F3D65484f557E627557f");
  console.log(`\nContract code length: ${code.length} bytes`);
  console.log(`Contract exists: ${code !== "0x"}`);
}

main();
