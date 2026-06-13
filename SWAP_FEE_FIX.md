# 10% Swap Fee Not Being Deducted - Fix Summary

## Problem
When users swap OSLO to USDT, the UI displays a 10% fee but **100% of the USDT is being sent to the user's wallet**. The 10% fee should remain in the liquidity pool, with only 90% going to the user.

## Root Cause
**Function name mismatch between frontend and deployed smart contract:**

- **Frontend calls:** `swapOSLOForBUSD` (old V1 function name)
- **Deployed contract (OSLODexV2) has:** `sellOSLO` (correct V2 function)
- **Frontend ABI:** Contains `swapOSLOForBUSD` but **missing** `sellOSLO`

The `sellOSLO` function in OSLODexV2 **correctly implements** the 10% fee:
```solidity
// Line 170-171 in OSLODexV2.sol
toUser = (usdtOut * (OSLOConstants.BASIS_POINTS - OSLOConstants.SELL_TAX_BP)) / OSLOConstants.BASIS_POINTS;
// User gets 90%, 10% stays in pool
```

## Files Fixed

### 1. `src/hooks/useOSLODEX.ts`
**Changed:**
- Function name: `swapOSLOForBUSD` → `sellOSLO`
- Added 10% fee calculation to frontend estimate: `outputAfterFee = estimatedOutput * 0.9`

### 2. `src/app/invest/page.tsx`
**Changed:**
- Function name: `swapOSLOForBUSD` → `sellOSLO`

### 3. `src/abis/OSLODEX.json` (NEEDS UPDATE)
**Action Required:**
The ABI file needs to be updated to include the `sellOSLO` function from the deployed OSLODexV2 contract at:
`0xC583E5f125F312a35045B6Be1eDd729658C7A48B`

**To update the ABI:**
```bash
cd contracts
# Extract ABI from deployed contract
npx hardhat run scripts/update-dex-abi.ts --network bscMainnet
```

Or manually add the `sellOSLO` function ABI from `contracts/artifacts/contracts/OSLODexV2.sol/OSLODexV2.json`

## Expected Behavior After Fix

### Before (Broken):
- User sells 1000 OSLO
- UI shows: "You'll receive ~90 USDT (10% fee)"
- **Actually receives:** 100 USDT (100%)
- **Liquidity pool:** Loses 100 USDT

### After (Fixed):
- User sells 1000 OSLO  
- UI shows: "You'll receive ~90 USDT (10% fee)"
- **Actually receives:** 90 USDT (90%)
- **Liquidity pool:** Keeps 10 USDT (10% fee)
- **OSLO tokens:** 50% burned, 50% added to reserve

## Smart Contract Logic (OSLODexV2.sellOSLO)

```solidity
function sellOSLO(uint256 osloAmount, uint256 minUSDTOut) 
    external override nonReentrant whenLiquidityInitialized returns (uint256 toUser)
{
    // 1. Transfer OSLO from user
    osloToken.safeTransferFrom(msg.sender, address(this), osloAmount);
    
    // 2. Calculate USDT output (constant product)
    uint256 usdtOut = (osloAmount * usdtReserve) / (osloReserve + osloAmount);
    
    // 3. Apply 10% sell tax — user gets 90%
    toUser = (usdtOut * 9000) / 10000;  // 90%
    
    // 4. Only deduct 90% from reserve (10% stays)
    usdtReserve -= toUser;
    
    // 5. Burn 50% of OSLO, add 50% to reserve
    uint256 toBurn = osloAmount / 2;
    uint256 toLiquidity = osloAmount - toBurn;
    
    // 6. Send 90% USDT to user
    usdt.safeTransfer(msg.sender, toUser);
}
```

## Verification Steps

After deploying the fixes:

1. **Check frontend console:** Verify `sellOSLO` function is being called
2. **Check transaction on BSCScan:** 
   - Look at `Sold` event emissions
   - Verify `usdtOut` vs `toUser` shows 10% difference
3. **Check DEX reserves:**
   - USDT reserve should decrease by only 90% of calculated output
   - OSLO reserve should increase by 50% of sold amount
4. **Test with small amount first:** Sell 10 OSLO and verify:
   - User receives ~90% of calculated USDT value
   - 10% remains in DEX USDT reserve

## Deployed Contract Addresses (BSC Mainnet)

- **OSLODexV2:** `0xC583E5f125F312a35045B6Be1eDd729658C7A48B`
- **OSLOToken:** `0xE1C6B447bFf4e8292d8c2463e3F68ED7Be8e4a32`
- **USDT:** `0x55d398326f99059fF775485246999027B3197955`

## Important Notes

1. **The smart contract is CORRECT** - no contract changes needed
2. **Only frontend fixes are required** - function name and ABI update
3. **The fee logic in OSLODexV2.sellOSLO works correctly** - it properly:
   - Calculates full USDT output
   - Applies 10% fee (user gets 90%)
   - Keeps 10% in liquidity pool
   - Burns 50% of OSLO
   - Adds 50% of OSLO to reserve
