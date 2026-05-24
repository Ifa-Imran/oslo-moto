import { ethers } from "hardhat";

async function main() {
  const osloDexAddr = '0xEBD4214473c0D6a1B65CE0BCc51b7aA56B7e6029';
  const osloTokenAddr = '0x73325878e79b63CDd839d0f4Ef1727574505E23D';
  const usdtAddr = '0xF8B01ACD8bD7aDdEC3e7287381b22Ac4c4291e7f';
  const engineAddr = '0x16FabcbcBbA0A40f5960E62c0E1CbF2aCE3936fa';

  const osloDEX = await ethers.getContractAt('OSLODEX', osloDexAddr);
  const osloToken = await ethers.getContractAt('OSLOToken', osloTokenAddr);
  const usdt = await ethers.getContractAt('MockUSDT', usdtAddr);
  const engine = await ethers.getContractAt('OSLOInvestmentEngine', engineAddr);

  // DEX state
  const [usdtReserve, osloReserve] = await osloDEX.getReserves();
  const totalSupply = await osloToken.totalSupply();
  const price = await osloDEX.getPrice();

  console.log('=== DEX State ===');
  console.log('USDT Reserve:', ethers.formatEther(usdtReserve), 'USDT');
  console.log('OSLO Reserve:', ethers.formatEther(osloReserve), 'OSLO');
  console.log('OSLO Total Supply:', ethers.formatEther(totalSupply), 'OSLO');
  console.log('Price (USDT per OSLO):', ethers.formatEther(price));
  console.log('Price (OSLO per $1):', price > 0n ? Number(ethers.formatEther(BigInt(1e18) * BigInt(1e18) / price)).toFixed(2) : 'N/A');

  // Calculate what $12.25 would give
  const testUsdt = ethers.parseEther('12.25');
  const osloFor12_25 = await osloDEX.getUSDTForOSLOOutput(testUsdt);
  console.log('\n=== $12.25 Reward Calculation ===');
  console.log('USDT input:', ethers.formatEther(testUsdt), 'USDT');
  console.log('OSLO output:', ethers.formatEther(osloFor12_25), 'OSLO');
  console.log('Expected at $1/OSLO:', '12.25 OSLO');
  console.log('Actual rate:', Number(ethers.formatEther(osloFor12_25)).toFixed(2), 'OSLO per $12.25');
  console.log('Effective price per OSLO:', '$' + (12.25 / Number(ethers.formatEther(osloFor12_25))).toExponential(6));

  // Check engine state
  const totalRewardsPaid = await engine.totalRewardsPaid();
  console.log('\n=== Engine Stats ===');
  console.log('Total rewards paid (USDT-denominated):', ethers.formatEther(totalRewardsPaid), 'USDT');
}

main().catch(console.error);
