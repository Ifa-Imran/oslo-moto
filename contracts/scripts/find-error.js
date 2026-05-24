const { ethers } = require('ethers');

const errors = [
  // OSLOInvestmentEngine
  'OnlyAdmin()',
  'OnlyTimelock()',
  'SetupAlreadyComplete()',
  'NotConfigured()',
  'DepositTooLow()',
  'DepositsPausedError()',
  'InvalidDeposit()',
  'DepositCapped()',
  'NothingToClaim()',
  'PrincipalLocked()',
  'ZeroAddress()',
  // OSLOReferral
  'AlreadyRegistered()',
  'InvalidReferrer()',
  'NotRegistered()',
  'NothingToClaim()',
  'SelfReferral()',
  // OSLODEX
  'OnlyLiquidityManager()',
  'ZeroAmount()',
  'InsufficientReserve()',
  'SlippageExceeded()',
  // OSLOLiquidityManager
  'CannotRescueProtocolTokens()',
  // ReentrancyGuard
  'ReentrancyGuardReentrantCall()',
];

console.log('=== FINDING ERROR SELECTOR 0xfb8f41b2 ===\n');

const target = '0xfb8f41b2';
let found = false;

errors.forEach(e => {
  const selector = ethers.id(e).slice(0, 10);
  if (selector === target) {
    console.log(`✅ MATCH: ${e} => ${selector}`);
    found = true;
  }
});

if (!found) {
  console.log('❌ Not found in common errors');
  console.log('\nThe error might be from:');
  console.log('1. A panic code (0x4e487b71)');
  console.log('2. A require/revert with string message');
  console.log('3. An error from a library contract');
  console.log('\nLooking at the error data, it contains:');
  console.log('- Address: 0x22cDa7FFff00965113e133b814447Ba418D1cbab (InvestmentEngine)');
  console.log('- Amount: 100 BUSD');
  console.log('\nThis suggests the InvestmentEngine is throwing a custom error');
  console.log('that takes (address, uint256) as parameters.');
}
