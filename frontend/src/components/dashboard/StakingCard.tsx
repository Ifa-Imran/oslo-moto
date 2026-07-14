"use client";

import { useStaking } from "@/hooks/useStaking";
import { useAccount } from "wagmi";
import { formatUSDT, calcProgress } from "@/lib/utils/format";
import { useEffect } from "react";
import toast from "react-hot-toast";

export function StakingCard() {
  const {
    userStake,
    activeStakeCount,
    stakeCount,
    accruedYield,
    claimableYield,
    totalClaimed,
    claimYield,
    isClaiming,
    isClaimSuccess,
    claimError,
    resetClaim,
    remainingCapacity,
    refetchYield,
    refetchClaimable,
  } = useStaking();
  const { address } = useAccount();

  // Show toast on claim success
  useEffect(() => {
    if (isClaimSuccess) {
      toast.success("Yield claimed successfully! OSLO tokens sent to your wallet.", {
        duration: 6000,
        icon: "✅",
      });
      // Force refetch all related data
      refetchYield();
      refetchClaimable();
      const timer = setTimeout(() => resetClaim(), 6000);
      return () => clearTimeout(timer);
    }
  }, [isClaimSuccess, resetClaim, refetchYield, refetchClaimable]);

  // Show toast on claim error
  useEffect(() => {
    if (claimError) {
      let errorMsg = "Unknown error";
      const msg = claimError.message || "";
      if (msg.includes("NoYieldToClaim") || msg.includes("No yield to claim")) {
        errorMsg = "No yield available to claim yet. Yield accrues daily.";
      } else if (msg.includes("NoActiveStake")) {
        errorMsg = "No active stake found. Please stake first.";
      } else if (msg.includes("DEX price is zero")) {
        errorMsg = "DEX price is currently zero. Please try again later.";
      } else if (msg.includes("3X") || msg.includes("cap")) {
        errorMsg = "Your stake has reached the 3X cap. No more yield to claim.";
      } else {
        errorMsg = msg.slice(0, 120) || "Claim failed. Please try again.";
      }
      toast.error(`Claim failed: ${errorMsg}`, {
        duration: 8000,
      });
      const timer = setTimeout(() => resetClaim(), 8000);
      return () => clearTimeout(timer);
    }
  }, [claimError, resetClaim]);

  if (!address) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Stake</h3>
        <p className="text-slate-500">Connect your wallet to view stake info</p>
      </div>
    );
  }

  const stake = userStake;
  const activeStake = stake?.activeStake ?? 0n;
  const totalEarnings = stake?.totalEarnings ?? 0n;
  const cap = activeStake * 3n;
  const progress = calcProgress(totalEarnings, activeStake);
  const isActive = stake?.isActive ?? false;
  const claimable = claimableYield ?? 0n;
  const hasClaimable = claimable > 0n;

  // Determine button state
  const buttonDisabled = isClaiming || !isActive || !hasClaimable;
  let buttonText = "Claim Yield (Convert to OSLO)";
  if (isClaiming) {
    buttonText = "Claiming...";
  } else if (!isActive) {
    buttonText = activeStake > 0n ? "Stake Capped (3X Reached)" : "No Active Stake";
  } else if (!hasClaimable) {
    buttonText = "No Yield to Claim Yet";
  } else {
    buttonText = `Claim $${formatUSDT(claimable)} USDT Yield (→ OSLO)`;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Your Stake</h3>
        {stakeCount > 0 && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
            {activeStakeCount} Active {activeStakeCount === 1 ? "Stake" : "Stakes"}
            {stakeCount > activeStakeCount && ` (${stakeCount - activeStakeCount} capped)`}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-slate-500">Total Active Stake</span>
          <span className="font-bold text-slate-900">{formatUSDT(activeStake)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total Earnings</span>
          <span className="text-green-600">{formatUSDT(totalEarnings)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total Yield Generated</span>
          <span className="text-amber-600">{formatUSDT(accruedYield)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total Claimed</span>
          <span className="text-green-600">{formatUSDT(totalClaimed)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">3X Cap</span>
          <span className="text-slate-900">{formatUSDT(cap)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Status</span>
          <span className={isActive ? "text-green-600" : "text-red-600"}>
            {isActive ? "Active" : activeStake > 0n ? "Capped" : "No Stake"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Remaining Capacity</span>
          <span className={
            remainingCapacity !== undefined && remainingCapacity === 0n
              ? "text-red-600"
              : remainingCapacity !== undefined && remainingCapacity < 5000n * 10n ** 18n
              ? "text-amber-600"
              : "text-green-600"
          }>
            {remainingCapacity !== undefined ? `${formatUSDT(remainingCapacity)} USDT` : "5,000 USDT"}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">{progress.toFixed(2)}% of 3X cap reached</p>
        </div>

        {/* Claimable yield */}
        {hasClaimable && (
          <div className="bg-green-50 border border-green-200 p-3 rounded-lg mt-4">
            <p className="text-sm text-green-700">
              Claimable Yield: <span className="font-bold">${formatUSDT(claimable)} USDT</span>
            </p>
          </div>
        )}

        {/* Success message */}
        {isClaimSuccess && (
          <div className="bg-green-50 border border-green-300 p-3 rounded-lg mt-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-green-700 font-medium">
              Yield claimed! OSLO tokens have been sent to your wallet.
            </p>
          </div>
        )}

        {/* Error message */}
        {claimError && (
          <div className="bg-red-50 border border-red-300 p-3 rounded-lg mt-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-700 font-medium">
              Claim failed. Please try again.
            </p>
          </div>
        )}

        <button
          onClick={claimYield}
          disabled={buttonDisabled}
          className={`w-full mt-4 font-medium py-2.5 px-4 rounded-lg transition-colors ${
            buttonDisabled
              ? "bg-slate-300 cursor-not-allowed text-slate-500"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}

