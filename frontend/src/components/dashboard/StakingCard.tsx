"use client";

import { useStaking } from "@/hooks/useStaking";
import { useAccount } from "wagmi";
import { formatUSDT, calcProgress } from "@/lib/utils/format";

export function StakingCard() {
  const {
    userStake,
    activeStakeCount,
    stakeCount,
    accruedYield,
    claimableYield,
    claimYield,
    isClaiming,
    remainingCapacity,
  } = useStaking();
  const { address } = useAccount();

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
        <div className="bg-green-50 border border-green-200 p-3 rounded-lg mt-4">
          <p className="text-sm text-green-700">
            Claimable Yield: {formatUSDT(claimableYield)} USDT
          </p>
        </div>

        <button
          onClick={claimYield}
          disabled={!claimableYield || claimableYield === 0n || isClaiming || !isActive}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          {isClaiming ? "Claiming..." : "Claim Yield (Convert to OSLO)"}
        </button>
      </div>
    </div>
  );
}

