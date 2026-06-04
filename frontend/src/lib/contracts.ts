// OSLO Protocol V3 Contract Addresses
// BSC Testnet (chainId: 97) — Testnet V3 Deployment
// USDT: MockUSDT on BSC Testnet

export const CONTRACTS = {
  // V3 Core contracts
  osloToken:  "0x4BF960c174cd7bd07D81ceCB23BBBd9b85C14CA4" as `0x${string}`,
  osloDEX:    "0x7C927c151A258eCB262f548BbD07B12C37Ae797a" as `0x${string}`,
  osloVault:  "0xE8bA0f6DBBF2121b0152E2f97B3673c00C9ac4e5" as `0x${string}`,
  usdt:       "0x87025Ab074A1184802C056A2B8F2fFD8051A6c0f" as `0x${string}`,

  // V2 backward-compatible aliases (point to Vault or stub for compilation)
  investmentEngine: "0xE8bA0f6DBBF2121b0152E2f97B3673c00C9ac4e5" as `0x${string}`, // = osloVault
  referral:         "0x0000000000000000000000000000000000000000" as `0x${string}`,
  rankSystem:       "0x0000000000000000000000000000000000000000" as `0x${string}`,
  dao:              "0x0000000000000000000000000000000000000000" as `0x${string}`,
  treasury:         "0x0000000000000000000000000000000000000000" as `0x${string}`,
  liquidityManager: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;
