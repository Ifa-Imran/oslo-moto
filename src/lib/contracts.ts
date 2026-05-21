// OSLO Protocol Contract Addresses
// Deployed on BSC Testnet (chainId: 97) — 2026-05-17 v13.0 (OSLO Yield + Principal Fix)
// Deployer: 0x47f8160e3C854b4b4679579b99726E5E81736B7f
// CHANGES: claimRewards() now mints OSLO tokens instead of paying BUSD.
//          withdrawPrincipal() pulls BUSD from rewardPool (fixes empty contract balance).
//          OSLOReferral now tracks per-level income (levelIncome mapping).

export const CONTRACTS = {
  osloToken: "0xC59B426d281E86be479a9813AB6023138eb29920" as `0x${string}`,
  investmentEngine: "0x82E28f4622bA521F6ebd5b7D6F3CF2FFd437A570" as `0x${string}`,
  referral: "0x1e052b11F423B66b403Ea23703Fe2680E3E91Ed5" as `0x${string}`,
  rankSystem: "0xe6D905616137282a05811C97bD49C1cA8DEfe623" as `0x${string}`,
  dao: "0xbCaf47c4d9843EDCBf5667d56dFd08Db1448C9Ad" as `0x${string}`,
  treasury: "0xd5eDf97E38642Ae00BDceee560b7E9020ACe3CF7" as `0x${string}`,
  liquidityManager: "0x1143c412EA3Bc72C932F195AA571934Ca3c505c1" as `0x${string}`,
  osloDEX: "0xD994Ef227726f1A0026872aD7e10b574964e4CE3" as `0x${string}`,
  busd: "0xd6988A4F4b704E9e11FEAcA70540630d70A9D6B4" as `0x${string}`,
} as const;
