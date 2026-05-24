// OSLO Protocol V2 Contract Addresses
// Deployed on BSC Testnet (chainId: 97)
// V2: USDT-based, 4-tier ranged yields, lifetime 0.45% rate
// DEX formulas fixed (osloReserve instead of totalSupply)
// $1 USDT registration fee → 100% LP

export const CONTRACTS = {
  osloToken: "0xD2F163b0921BA8A98034621e18326059391d2E01" as `0x${string}`,
  investmentEngine: "0x3D9C6D36Cd08a55DbFb3F1EA3531014cf44560ad" as `0x${string}`,
  referral: "0xE635822290af7F181d7972e8d5c51134ae605f37" as `0x${string}`,
  rankSystem: "0x6d14b699f0B3025267AD2A1984aE867484c7227b" as `0x${string}`,
  dao: "0xf32c655E2649a4d797f158B96B9b7Bb243bEC775" as `0x${string}`,
  treasury: "0x0B0dBb32Ed3a282C72c0E7f20D9903b27398cc18" as `0x${string}`,
  liquidityManager: "0x5D84988555D2A5AEbFf9C73F654141afac33D487" as `0x${string}`,
  osloDEX: "0x2f0F01fF768670104a193756a0b08496bBAad2C2" as `0x${string}`,
  usdt: "0x8B11FB2C5DF57C7016Fc2dC4b4234e0904D3ec47" as `0x${string}`,
} as const;
