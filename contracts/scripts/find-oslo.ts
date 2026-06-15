import { ethers } from "hardhat";

const OSLO = "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6";
const OLD_DEX = "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F";
const OLD_IE1 = "0x154B8211CE98B3d9B8068396b8E85DEEA8B667EC";
const OLD_IE2 = "0xcB406995e635C577d22b66F71fD84e748eC67488";
const NEW_DEX = "0xb220f4A59ab079879Cc38AF2d69B0E2918Db100B";
const NEW_IE = "0x8A9418c8E49bd7Bc6368b5D20fc6dd3D2DCcf97d";

async function main() {
  const [deployer] = await ethers.getSigners();
  const abi = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function admin() view returns (address)", "function minter() view returns (address)", "function mint(address,uint256)"];
  const oslo = new ethers.Contract(OSLO, abi, deployer);
  
  console.log("OSLO total supply:", ethers.formatEther(await oslo.totalSupply()));
  console.log("\nBalances:");
  console.log("  Deployer:", ethers.formatEther(await oslo.balanceOf(deployer.address)));
  console.log("  Old DEX:", ethers.formatEther(await oslo.balanceOf(OLD_DEX)));
  console.log("  Old IE1:", ethers.formatEther(await oslo.balanceOf(OLD_IE1)));
  console.log("  Old IE2:", ethers.formatEther(await oslo.balanceOf(OLD_IE2)));
  console.log("  New DEX:", ethers.formatEther(await oslo.balanceOf(NEW_DEX)));
  console.log("  New IE:", ethers.formatEther(await oslo.balanceOf(NEW_IE)));

  // Try to mint
  console.log("\nAttempting to mint 1M OSLO...");
  try {
    const tx = await oslo.mint(deployer.address, ethers.parseEther("1000000"));
    await tx.wait();
    console.log("  Minted 1,000,000 OSLO to deployer!");
  } catch (e: any) {
    console.log("  Mint failed:", e.message?.slice(0, 120));
  }
}

main().catch(console.error);