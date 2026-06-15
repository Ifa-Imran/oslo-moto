// OSLO Protocol Testnet Contract Addresses
// BSC Testnet (chainId: 97) — For localhost development & testing
// Updated: V5 full fresh deploy with correct USDT + new OSLOToken

export const CONTRACTS_TESTNET = {
  // V5 Core contracts (fresh deploy)
  osloToken:  "0x42062C7dD20Fc6a17987763E8db0d0acDDBEa6d5" as `0x${string}`,
  osloDEX:    "0xe3368093Cf0Ed990bb628C261F5e1A483DA74Ee3" as `0x${string}`,
  osloVault:  "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9" as `0x${string}`, // Points to IE (IE has all read functions)
  usdt:       "0xbC9352a7abb1Af216aC65B2efB55A9738fAdC62C" as `0x${string}`, // Mock USDT with faucet

  // V5 contracts
  investmentEngine: "0xcfE0F587D22365F529055dE49a1aCE3C2F1E56E9" as `0x${string}`,
  referral:         "0xFa55A91C36f1ccdB83B13114ebFbC16F6C7e4FBe" as `0x${string}`,
  rankSystem:       "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844" as `0x${string}`,
  dao:              "0x09C08286af0F61C7976841235b4582cfdCe7b37F" as `0x${string}`,
  treasury:         "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1" as `0x${string}`,
  liquidityManager: "0x60236C3CD3FAd89Bb8F125Da1bA1b5422AFCC04E" as `0x${string}`,
} as const;
