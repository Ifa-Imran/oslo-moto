"use client";

import { ReferralTree } from "@/components/team/ReferralTree";
import { useAccount, useReadContract } from "wagmi";
import { investmentEngineABI, referralRegistryABI, CONTRACTS } from "@/lib/contracts";
import { formatUSDT, calcProgress } from "@/lib/utils/format";
import { bsc } from "wagmi/chains";
import Link from "next/link";

export default function TeamPage() {
  const { address } = useAccount();

  // User's own stake info
  const { data: userStake } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getUserStake",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Total claimed by user
  const { data: totalClaimed } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalClaimed",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Claimable yield
  const { data: claimableYield } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getClaimableYield",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  // Team size (all 20 levels)
  const { data: teamSize } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getTeamSize",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Team volume (total staking volume of all downline)
  const { data: teamVolume } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getTeamVolume",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Direct downline count
  const { data: directCount } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getDirectDownlineCount",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Derived values
  const activeStake = userStake?.activeStake ?? 0n;
  const totalEarnings = userStake?.totalEarnings ?? 0n;
  const cap = activeStake * 3n;
  const progress = calcProgress(totalEarnings, activeStake);
  const isActive = userStake?.isActive ?? false;
  const claimable = claimableYield ?? 0n;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Team &amp; Investment</h1>
        <p className="text-slate-500 mt-1">Your investment status and referral network overview</p>
      </div>

      {address && (
        <>
          {/* Investment Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-600 font-medium">Active Stake</p>
              <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(activeStake)}</p>
              <p className="text-[10px] text-slate-400 mt-1">USDT</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium">Total Earnings</p>
              <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalEarnings)}</p>
              <p className="text-[10px] text-slate-400 mt-1">From yield</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-600 font-medium">Total Claimed</p>
              <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalClaimed ?? 0n)}</p>
              <p className="text-[10px] text-slate-400 mt-1">Lifetime</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-xl p-4">
              <p className="text-xs text-purple-600 font-medium">Claimable Now</p>
              <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(claimable)}</p>
              <p className="text-[10px] text-slate-400 mt-1">Ready to claim</p>
            </div>
          </div>

          {/* Stake Progress + Status */}
          {activeStake > 0n && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Investment Progress</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {isActive ? "Active" : "Capped (3X Reached)"}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Active Stake</span>
                  <span className="font-bold text-slate-900">${formatUSDT(activeStake)} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Earnings</span>
                  <span className="font-bold text-green-600">${formatUSDT(totalEarnings)} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">3X Cap</span>
                  <span className="font-bold text-slate-900">${formatUSDT(cap)} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Remaining Capacity</span>
                  <span className="font-bold text-slate-900">${formatUSDT(cap > totalEarnings ? cap - totalEarnings : 0n)} USDT</span>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{progress.toFixed(2)}% of 3X cap reached</p>
                </div>
              </div>
              {claimable > 0n && (
                <Link href="/" className="inline-block mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Claim ${formatUSDT(claimable)} Yield →
                </Link>
              )}
            </div>
          )}

          {/* Team Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-500">Team Size</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{teamSize?.toString() || "0"}</p>
              <p className="text-xs text-slate-400 mt-1">All 20 levels</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-500">Team Volume</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">${formatUSDT(teamVolume ?? 0n)}</p>
              <p className="text-xs text-slate-400 mt-1">Total staked by downline</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-500">Direct Referrals</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{directCount?.toString() || "0"}</p>
              <p className="text-xs text-slate-400 mt-1">Directly invited</p>
            </div>
          </div>
        </>
      )}

      <ReferralTree />
    </div>
  );
}
