// OSLO Protocol Testnet Contract Addresses
// BSC Testnet (chainId: 97) — For localhost development & testing
// Updated: New InvestmentEngine V3 with early exit timer fix

export const CONTRACTS_TESTNET = {
  // V3 Core contracts
  osloToken:  "0x3191BBd57A21725E4Bf1eE9EC3C9d475b43b3DE6" as `0x${string}`,
  osloDEX:    "0x5a6920Bb151d7A8Df9E2d11Cb1Ec2ce6A4A0Ee5F" as `0x${string}`,
  osloVault:  "0xe188afCb1Dacd30Ca8BbF5F69dBf64b08b0136B8" as `0x${string}`,
  usdt:       "0x493769a8F24e62AEEB8aE6C2d8E24327BD41FEE3" as `0x${string}`,

  // V2 backward-compatible aliases
  investmentEngine: "0xcB406995e635C577d22b66F71fD84e748eC67488" as `0x${string}`, // NEW V3 with early exit fix
  referral:         "0x77e81eE198d93b16FFA7784540d2FEeE3cD25274" as `0x${string}`,
  rankSystem:       "0xf2F0C4ecA5152dDE2ADbadE8F311f297370F0844" as `0x${string}`,
  dao:              "0x09C08286af0F61C7976841235b4582cfdCe7b37F" as `0x${string}`,
  treasury:         "0xaE99dFB0285d30Bf263fA9192A414ac818b686a1" as `0x${string}`,
  liquidityManager: "0x60236C3CD3FAd89Bb8F125Da1bA1b5422AFCC04E" as `0x${string}`,
} as const;
