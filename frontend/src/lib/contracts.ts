// OSLO Protocol V2 Contract Addresses
// Deployed on BSC Testnet (chainId: 97)
// V2: USDT-based, 4-tier ranged yields, lifetime 0.45% rate
// DEX formulas fixed (osloReserve instead of totalSupply)
// $1 USDT registration fee → 100% LP

export const CONTRACTS = {
  osloToken: "0x8836b854B5F227F568aC92D9617CC437a4B664eF" as `0x${string}`,
  investmentEngine: "0x2CD868Ca92C6600181B8aE9fF8ebb04329D056A2" as `0x${string}`,
  referral: "0x7300272998c3D2Ee84888Ae3Fb90A11D250F7704" as `0x${string}`,
  rankSystem: "0x453eeC0fb14A9C8b85cdc3A1b61745cDADE1E195" as `0x${string}`,
  dao: "0xD7Cb5034a4500B610EE9a7Cf0E44BDeBafFEfbFa" as `0x${string}`,
  treasury: "0x1F6757eB0168Ac88344B88C3c4a673E2Ca39Ee46" as `0x${string}`,
  liquidityManager: "0x8acde1B799Afbf67Cb672a03b9A14C5F8AFEDe1D" as `0x${string}`,
  osloDEX: "0x3d41a29D10EC346371E0E36e0323B12c4bC12335" as `0x${string}`,
  usdt: "0x5A004b58BD164c509F1D97Cd9Cd52cfe3895A3C1" as `0x${string}`,
} as const;
