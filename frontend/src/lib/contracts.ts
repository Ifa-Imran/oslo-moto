// OSLO Protocol V3 Contract Addresses
// BSC Mainnet (chainId: 56) — Mainnet V3 Deployment
// USDT: Real BSC USDT

export const CONTRACTS = {
  // V3 Core contracts
  osloToken:  "0xD22fA2a8AC7F97aFaB46e580FbbF59696D3F942c" as `0x${string}`,
  osloDEX:    "0x1dA86De96E3A7f9bA3645A01B843F0ded8E6e84D" as `0x${string}`,
  osloVault:  "0x988bA1DffA546cF8b76FcfEEe81F407851A89CC3" as `0x${string}`,
  usdt:       "0x55d398326f99059fF775485246999027B3197955" as `0x${string}`,

  // V2 backward-compatible aliases
  investmentEngine: "0xe0625F7D8482617A2E05cf1dFdab6b75C5b9ACCa" as `0x${string}`, // = OSLOInvestmentEngine
  referral:         "0xCF3F7B63b952Bef316308642494c51EBD8Cc59C8" as `0x${string}`,
  rankSystem:       "0xf0C3bFCf6a90269b40Cbda15374EF9b4A1a9F67C" as `0x${string}`,
  dao:              "0x708C360721baabb9FA982b37c79Fd3E21e374FEF" as `0x${string}`,
  treasury:         "0x2c781d6c9F78Dd09f51BC56e12c57e9c9d3200aF" as `0x${string}`,
  liquidityManager: "0x993556946C2AbFDE75dEEAA2Dc393d5ac1e0038E" as `0x${string}`,
} as const;
