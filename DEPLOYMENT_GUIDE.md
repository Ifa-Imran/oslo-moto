# OSLO InvestmentEngine V3 Deployment Guide

## Overview

This guide covers the deployment of the new OSLOInvestmentEngine contract with critical fixes:

1. **Early Exit Timer Fix**: Timer now only triggers on FIRST deposit (one-time per account)
2. **Missing Trial Functions**: Added `isInTrialPeriod()` and `getTrialTimeRemaining()`
3. **Level Income Distribution**: Already working, no changes needed

---

## Pre-Deployment Checklist

### ✅ Code Changes Verified
- [x] OSLOInvestmentEngine.sol compiled successfully
- [x] Early exit timer fix implemented
- [x] Trial period functions added
- [x] Migration scripts created

### ✅ Scripts Created
- [x] `deploy-investment-engine-v3.ts` - Deploys new contract
- [x] `migrate-investment-engine.ts` - Migrates user data
- [x] `diagnose-level-income-distribution.ts` - Verifies level income
- [x] `diagnose-early-exit-timer.ts` - Verifies early exit fix

---

## Deployment Steps

### Phase 1: Testnet Deployment (REQUIRED)

#### Step 1: Deploy to BSC Testnet

```bash
cd contracts
npx hardhat run scripts/deploy-investment-engine-v3.ts --network bscTestnet
```

**Expected Output:**
- New InvestmentEngine address
- Configuration confirmation
- Contract pointer updates

#### Step 2: Test Early Exit Timer Fix

```bash
# Run diagnostic script
npx hardhat run scripts/diagnose-early-exit-timer.ts --network bscTestnet
```

**Test Scenarios:**
1. Create test account, make first deposit → Timer should show 10 days
2. Wait 1 day (or fast-forward), make second deposit → Timer should NOT reset
3. Wait 9 more days (total 10) → Timer should expire permanently
4. Make third deposit → NO timer should appear

#### Step 3: Test Level Income Distribution

```bash
# Run diagnostic script
npx hardhat run scripts/diagnose-level-income-distribution.ts --network bscTestnet
```

**Test Scenarios:**
1. Create referral chain (3-5 levels)
2. User at bottom claims yield
3. Verify uplines receive commissions in referralRewards
4. Uplines claim referral rewards as OSLO

#### Step 4: Test Migration Script

```bash
# Update migration script with new testnet addresses
# Then run:
npx hardhat run scripts/migrate-investment-engine.ts --network bscTestnet
```

**Verify:**
- User deposits migrated correctly
- Combined earnings preserved
- USDT/OSLO balances transferred

---

### Phase 2: Mainnet Deployment

#### Prerequisites
- [ ] All testnet tests passed
- [ ] Deployer wallet has sufficient BNB for gas (~0.5 BNB)
- [ ] Deployer wallet has OSLO for seeding (~5M OSLO)
- [ ] Backup of all existing contract addresses
- [ ] Team notified of deployment window

#### Step 1: Deploy to BSC Mainnet

```bash
npx hardhat run scripts/deploy-investment-engine-v3.ts --network bscMainnet
```

**Save the output:**
- New InvestmentEngine address
- Transaction hashes
- Deployment timestamp

#### Step 2: Verify Contract on BSCScan

```bash
npx hardhat verify --network bscMainnet \
  <NEW_IE_ADDRESS> \
  0x55d398326f99059fF775485246999027B3197955 \
  0xE1C6B447bFf4e8292d8c2463e3F68ED7Be8e4a32 \
  1778371200
```

#### Step 3: Run Migration Script

```bash
# Edit migrate-investment-engine.ts and update NEW_IE address
# Then run:
npx hardhat run scripts/migrate-investment-engine.ts --network bscMainnet
```

**Critical Checks:**
- [ ] User count matches between old and new IE
- [ ] Combined earnings migrated for all users
- [ ] USDT balance transferred (if applicable)
- [ ] OSLO balance transferred (if applicable)

#### Step 4: Update Contract Pointers

**Referral Contract:**
```javascript
// If setupComplete = false:
await referral.configure(newIEAddress, dexAddress, timelock);

// If setupComplete = true:
await referral.connect(timelockSigner).setInvestmentEngine(newIEAddress);
```

**RankSystem Contract:**
```javascript
await rankSystem.setInvestmentEngine(newIEAddress);
```

**DEX Contract:**
```javascript
// Requires timelock or admin authorization
await dex.setInvestmentEngine(newIEAddress);
```

#### Step 5: Update Frontend

Edit `src/lib/contracts.ts`:

```typescript
export const CONTRACTS = {
  // ... other addresses ...
  investmentEngine: "<NEW_IE_ADDRESS>", // ← Update this
  // ... other addresses ...
}
```

#### Step 6: Seed OSLO to New IE

```javascript
// Transfer OSLO from deployer or old IE
await osloToken.transfer(newIEAddress, ethers.parseEther("5000000")); // 5M OSLO
```

#### Step 7: Final Verification

```bash
# Run all diagnostic scripts
npx hardhat run scripts/diagnose-level-income-distribution.ts --network bscMainnet
npx hardhat run scripts/diagnose-early-exit-timer.ts --network bscMainnet
```

**Check:**
- [ ] Level income distributing correctly (check ReferralPaid events)
- [ ] Early exit timer not resetting on new deposits
- [ ] User balances match old IE
- [ ] Yield claims working
- [ ] Referral rewards claimable

---

## Post-Deployment Monitoring

### 24-Hour Monitoring Checklist

- [ ] Monitor for failed transactions
- [ ] Check ReferralPaid events are emitting
- [ ] Verify uplines receiving commissions
- [ ] Confirm early exit timer behavior
- [ ] Monitor OSLO balance in new IE
- [ ] Check for user complaints/issues

### 48-Hour Monitoring

- [ ] All critical functions working
- [ ] No unusual gas spikes
- [ ] Level income distribution accurate
- [ ] Early exit timer permanent after 10 days
- [ ] User feedback positive

### Consider Deprecating Old IE

After 1-2 weeks of successful operation:
1. Announce old IE deprecation
2. Redirect all traffic to new IE
3. Consider pausing old IE (if possible)
4. Document lessons learned

---

## Rollback Plan

If critical issues are discovered:

### Option 1: Revert Frontend
```typescript
// Revert to old IE address
investmentEngine: "0x4d27A6564BE18fF57f4484aCBd8F5bCc9caB2E80"
```

### Option 2: Pause New IE
```javascript
// If admin access still available
await newIE.pauseDeposits(true);
```

### Option 3: Emergency Withdraw
```javascript
// Users withdraw from new IE, back to old IE
// Manual coordination required
```

---

## Troubleshooting

### Issue: Level Income Not Distributing

**Diagnostic:**
```bash
npx hardhat run scripts/diagnose-level-income-distribution.ts --network bscMainnet
```

**Common Causes:**
1. Referral contract not pointing to new IE → Update pointer
2. Insufficient OSLO in IE → Seed more OSLO
3. Users not claiming yield → Educate users
4. Level income accrued but not claimed → Users call `claimReferralRewards()`

### Issue: Early Exit Timer Still Resetting

**Diagnostic:**
```bash
npx hardhat run scripts/diagnose-early-exit-timer.ts --network bscMainnet
```

**Common Causes:**
1. Frontend still using old IE → Update `contracts.ts`
2. Contract not deployed correctly → Verify on BSCScan
3. User confusion about per-deposit vs per-account → Educate users

### Issue: Migration Failed for Some Users

**Diagnostic:**
```javascript
// Check specific user
const oldData = await oldIE.userDeposits(user, 0);
const newData = await newIE.userDeposits(user, 0);
```

**Solutions:**
1. Re-run migration script for failed users
2. Manual migration via admin functions
3. User withdraws and re-deposits (last resort)

---

## Contract Addresses

### Old Contract (V2)
| Contract | Address |
|----------|---------|
| **InvestmentEngine** | `0x4d27A6564BE18fF57f4484aCBd8F5bCc9caB2E80` |
| **Referral** | `0x04874b7fE1b31B4cC45575f15bcE7Aeb90399Cd3` |
| **RankSystem** | `0xb678aB43824a244568f5959c4A1B003023d97aD6` |
| **DEX** | `0xC583E5f125F312a35045B6Be1eDd729658C7A48B` |

### New Contract (V3)
| Contract | Address |
|----------|---------|
| **InvestmentEngine** | `TODO: Fill after deployment` |
| **Referral** | Same (pointer updated) |
| **RankSystem** | Same (pointer updated) |
| **DEX** | Same (pointer updated) |

---

## Files Modified

### Smart Contracts
- `contracts/contracts/OSLOInvestmentEngine.sol`
  - Added `earlyExitExpired` field to UserInfo
  - Added `isInTrialPeriod()` function
  - Added `getTrialTimeRemaining()` function
  - Modified `deposit()` to set flag
  - Modified `claimRewards()` to set flag

### Scripts
- `contracts/scripts/deploy-investment-engine-v3.ts` (NEW)
- `contracts/scripts/migrate-investment-engine.ts` (NEW)
- `contracts/scripts/diagnose-level-income-distribution.ts` (NEW)
- `contracts/scripts/diagnose-early-exit-timer.ts` (UPDATED)

### Documentation
- `EARLY_EXIT_TIMER_FIX.md` (PREVIOUS)
- `LEVEL_INCOME_DISTRIBUTION_FIX.md` (PREVIOUS)
- `DEPLOYMENT_GUIDE.md` (THIS FILE)

---

## Support

For issues or questions:
1. Check diagnostic scripts output
2. Review BSCScan transactions
3. Check contract events (ReferralPaid, Deposited, RewardsClaimed)
4. Contact development team

---

**Deployment Date**: TBD  
**Deployed By**: TBD  
**Verified By**: TBD  
**Status**: Ready for testnet testing
