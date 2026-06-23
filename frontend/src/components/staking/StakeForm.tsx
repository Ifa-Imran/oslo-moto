"use client";

import { useState } from "react";
import { useStaking } from "@/hooks/useStaking";
import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import { formatUnits, parseUnits, isAddress } from "viem";

const TIER1_MIN = 10n * 10n ** 18n;
const TIER1_MAX = 2499n * 10n ** 18n;
const TIER2_MIN = 2500n * 10n ** 18n;
const TIER2_MAX = 5000n * 10n ** 18n;
const MAX_TOTAL_STAKE = 5000n * 10n ** 18n; // $5,000 max total per wallet

export function StakeForm() {
  const { address } = useAccount();
  const searchParams = useSearchParams();
  const refParam = searchParams.get("ref") || "";

  const [amount, setAmount] = useState("");
  const [tier, setTier] = useState<1 | 2>(1);
  const [referrer, setReferrer] = useState(refParam);
  const [error, setError] = useState("");

  const refAddress = referrer || "0x0000000000000000000000000000000000000000";

  const {
    usdtBalance,
    isApproved,
    approve,
    stake,
    isApproving,
    isStaking,
    isStakeSuccess,
    approveError,
    approveConfirmError,
    stakeError,
    stakeConfirmError,
    resetStakeFlow,
    remainingCapacity,
  } = useStaking(amount, tier, refAddress);

  const isBusy = isApproving || isStaking;

  const validate = () => {
    setError("");

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Enter a valid amount");
      return false;
    }

    const parsed = parseUnits(amount, 18);

    if (tier === 1) {
      if (parsed < TIER1_MIN || parsed > TIER1_MAX) {
        setError("Tier 1 requires $10 - $2,499");
        return false;
      }
    } else {
      if (parsed < TIER2_MIN || parsed > TIER2_MAX) {
        setError("Tier 2 requires $2,500 - $5,000");
        return false;
      }
    }

    // Check $5,000 total stake limit per wallet
    if (remainingCapacity !== undefined && parsed > remainingCapacity) {
      const remaining = Number(formatUnits(remainingCapacity, 18));
      if (remaining === 0) {
        setError("You have reached the $5,000 maximum total stake limit per wallet.");
      } else {
        setError(`This amount exceeds your remaining capacity of $${remaining} USDT. Max $5,000 total per wallet.`);
      }
      return false;
    }

    if (usdtBalance !== undefined && parsed > usdtBalance) {
      setError(`Insufficient balance. You have $${formatUnits(usdtBalance, 18)} USDT`);
      return false;
    }

    if (referrer && !isAddress(referrer)) {
      setError("Invalid referrer address");
      return false;
    }

    if (referrer && referrer.toLowerCase() === address?.toLowerCase()) {
      setError("You cannot refer yourself");
      return false;
    }

    return true;
  };

  const handleStake = () => {
    if (!validate()) return;

    if (isApproved) {
      stake();
    } else {
      approve();
    }
  };

  const getButtonText = () => {
    if (isApproving) return "Approve USDT in wallet...";
    if (isStaking) return "Sign stake transaction...";
    if (isApproved) return "Confirm Stake";
    return "Approve USDT & Stake";
  };

  if (!address) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Stake USDT</h3>
        <p className="text-slate-500">Connect your wallet to stake</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Stake USDT</h3>

      <div className="space-y-4">
        {/* Tier Selection */}
        <div>
          <label className="block text-sm text-slate-500 mb-2">Select Tier</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTier(1)}
              disabled={isBusy}
              className={`p-3 rounded-lg border text-center transition-colors ${
                tier === 1
                  ? "border-blue-500 bg-blue-50 text-slate-900"
                  : "border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-400"
              }`}
            >
              <p className="font-medium">Tier 1</p>
              <p className="text-xs mt-1">$10 - $2,499</p>
            </button>
            <button
              onClick={() => setTier(2)}
              disabled={isBusy}
              className={`p-3 rounded-lg border text-center transition-colors ${
                tier === 2
                  ? "border-blue-500 bg-blue-50 text-slate-900"
                  : "border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-400"
              }`}
            >
              <p className="font-medium">Tier 2</p>
              <p className="text-xs mt-1">$2,500 - $5,000</p>
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm text-slate-500 mb-2">Amount (USDT)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const val = e.target.value;
              setAmount(val);
              setError("");
              // Reset previous stake success/error state when starting a new stake
              if (isStakeSuccess) resetStakeFlow();
              // Auto-select tier based on amount
              const num = Number(val);
              if (!isNaN(num) && num > 0) {
                if (num >= 2500) {
                  setTier(2);
                } else if (num <= 2499) {
                  setTier(1);
                }
              }
            }}
            disabled={isBusy}
            placeholder={tier === 1 ? "10 - 2,499" : "2,500 - 5,000"}
            className="w-full bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Referrer Input */}
        <div>
          <label className="block text-sm text-slate-500 mb-2">Referrer Address (optional)</label>
          <input
            type="text"
            value={referrer}
            onChange={(e) => {
              setReferrer(e.target.value);
              setError("");
            }}
            disabled={isBusy}
            placeholder="0x..."
            className="w-full bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50 font-mono text-sm"
          />
        </div>

        {/* Balance & Approval Status */}
        <div className="bg-slate-100 rounded-lg p-3 text-sm">
          <div className="flex justify-between text-slate-500 mb-1">
            <span>USDT Balance:</span>
            <span className={usdtBalance && usdtBalance > 0n ? "text-green-600" : "text-red-600"}>
              ${usdtBalance !== undefined ? formatUnits(usdtBalance, 18) : "--"}
            </span>
          </div>
          <div className="flex justify-between text-slate-500 mb-1">
            <span>Approval Status:</span>
            <span className={isApproved ? "text-green-600" : "text-amber-600"}>
              {isApproved ? "Approved" : "Approval required"}
            </span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Remaining Stake Capacity:</span>
            <span className={
              remainingCapacity !== undefined && remainingCapacity === 0n
                ? "text-red-600"
                : remainingCapacity !== undefined && remainingCapacity < MAX_TOTAL_STAKE
                ? "text-amber-600"
                : "text-green-600"
            }>
              ${remainingCapacity !== undefined ? formatUnits(remainingCapacity, 18) : "5,000"} / 5,000
            </span>
          </div>
        </div>

        {/* Errors */}
        {(error || approveError || approveConfirmError || stakeError || stakeConfirmError) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
            {error ||
              approveError?.message ||
              approveConfirmError?.message ||
              stakeError?.message ||
              stakeConfirmError?.message ||
              "Transaction failed. Please try again."}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleStake}
          disabled={isBusy || !amount}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {getButtonText()}
        </button>

        {/* Step indicator */}
        {isBusy && (
          <p className="text-xs text-slate-400 text-center">
            {isApproving
              ? "Step 1/2: Approve USDT spending"
              : "Step 2/2: Confirm stake"}
          </p>
        )}

        {/* Success */}
        {isStakeSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-600 text-center">
            Stake successful! You can stake again with a different amount.
          </div>
        )}

        {/* Info */}
        <div className="bg-slate-100 rounded-lg p-3 text-xs text-slate-500 space-y-1">
          <p>• Max $5,000 total investment per wallet (single ID)</p>
          <p>• Multiple stakes allowed up to $5,000 total</p>
          <p>• 95.5% goes to DEX liquidity pool</p>
          <p>• 2% to reward wallet, 0.5% to DAO</p>
          <p>• 1% company fee, 1% performance fee</p>
          <p>• Earnings capped at 3X your stake</p>
        </div>
      </div>
    </div>
  );
}
