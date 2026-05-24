// OSLO Protocol V2 Contract Addresses
// Deployed on BSC Testnet (chainId: 97)
// V2: USDT-based, 4-tier ranged yields, lifetime 0.45% rate
// DEX formulas fixed (osloReserve instead of totalSupply)
// $1 USDT registration fee → 100% LP

export const CONTRACTS = {
  osloToken: "0x203D33abBf8cbb3ce4A8f61Cf13e10394A0bE65C" as `0x${string}`,
  investmentEngine: "0xe54a5E4811eA5014FAF5304e5A12D309A0135F2F" as `0x${string}`,
  referral: "0x57e7317f6ff98881fdc54604bf64DA274478B157" as `0x${string}`,
  rankSystem: "0x7f063C8DA2AA9C44fDB92D0346031f873C891811" as `0x${string}`,
  dao: "0xD654c35fAaA33217e55b86c6C1bD4FCCc0B1F05f" as `0x${string}`,
  treasury: "0x6d4e694fa067A63A17c4187f795f9ED7D1f76810" as `0x${string}`,
  liquidityManager: "0x80e990fe6C9313c0a4Dbc82Ed28bC88bDf75a279" as `0x${string}`,
  osloDEX: "0x109944D383b476bc7257F68e137D4011E534A34f" as `0x${string}`,
  usdt: "0xdFAff6C92d9d4e0935cAF3429e80C821A044161c" as `0x${string}`,
} as const;
