import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const referralAddr = '0x35059A826Fa3540DC18319485c2bb499cF4ba2E8';
  const usdtAddr = '0xF8B01ACD8bD7aDdEC3e7287381b22Ac4c4291e7f';
  
  const referral = await ethers.getContractAt('OSLOReferral', referralAddr);
  const usdt = await ethers.getContractAt('MockUSDT', usdtAddr);
  
  const isReg = await referral.userInfo(deployer.address);
  console.log('Deployer registered:', isReg.registered);
  console.log('Deployer referrer:', isReg.referrer);
  
  const usdtBal = await usdt.balanceOf(deployer.address);
  console.log('Deployer USDT balance:', ethers.formatEther(usdtBal));
  
  const allowance = await usdt.allowance(deployer.address, referralAddr);
  console.log('USDT allowance for Referral:', ethers.formatEther(allowance));
  
  const treasury = await referral.treasury();
  const lm = await referral.liquidityManager();
  console.log('Treasury:', treasury);
  console.log('LiquidityManager:', lm);
  
  // Try to register deployer if not already
  if (!isReg.registered) {
    console.log('Attempting to register deployer as root...');
    try {
      const tx = await referral.register(deployer.address, ethers.ZeroAddress);
      await tx.wait();
      console.log('Registration successful!');
    } catch (e: any) {
      console.error('Registration failed:', e.message);
      // Try to decode error
      if (e.data) {
        console.error('Error data:', e.data);
      }
    }
  }
}

main().catch(console.error);
