// OSLO Protocol V3 Contract Addresses
// BSC Mainnet (chainId: 56) — Mainnet V3 Deployment
// USDT: Real BSC USDT

export const CONTRACTS = {
  // V3 Core contracts
  osloToken:  "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c" as `0x${string}`,
  osloDEX:    "0x1734613B59b0B976e180aF4007205A4F6D26f55f" as `0x${string}`,
  osloVault:  "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3" as `0x${string}`,
  usdt:       "0x55d398326f99059fF775485246999027B3197955" as `0x${string}`,

  // V2 backward-compatible aliases
  investmentEngine: "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3" as `0x${string}`, // = osloVault
  referral:         "0xe152a63A8f0587Af9C0bAe1acfccA5345642358e" as `0x${string}`,
  rankSystem:       "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C" as `0x${string}`,
  dao:              "0x708C360721baabb9FA982b37c79Fd3E21e374FEF" as `0x${string}`,
  treasury:         "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF" as `0x${string}`,
  liquidityManager: "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E" as `0x${string}`,
} as const;
