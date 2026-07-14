"use client";

import { StakingCard } from "@/components/dashboard/StakingCard";
import { useAccount, useReadContract } from "wagmi";
import { investmentEngineABI, osloDexABI, osloTokenABI, usdtABI, referralRegistryABI, levelIncomeSystemABI, leadershipBonusABI, CONTRACTS } from "@/lib/contracts";
import { formatUSDT, formatOSLO, formatPrice } from "@/lib/utils/format";
import { useState } from "react";
import Link from "next/link";
import { bsc } from "wagmi/chains";
import { useTodayStats } from "@/hooks/useTodayStats";

export default function DashboardPage() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  // Today's stats (claim + level income)
  const { todayClaim, todayLevelIncome, totalClaimed, totalCommissions } = useTodayStats();

  // Check if user has staked (referral link only shown after staking)
  const { data: hasStaked } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "hasStaked",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read total bonus paid (leadership bonus)
  const { data: totalBonusPaid } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "totalBonusPaid",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Total earnings = staking claimed + level commissions + leadership bonus
  const totalIncome = totalClaimed + totalCommissions + (totalBonusPaid ?? 0n);

  // My Team Size (all downlines up to 20 levels)
  const { data: teamSize } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getTeamSize",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // DEX price
  const { data: dexPrice } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "getPrice",
    chainId: bsc.id,
    query: { refetchInterval: 15000 },
  });

  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${address}`
    : "";

  const copyReferralLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = referralLink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.querySelector<HTMLInputElement>("input[readonly]");
      if (input) {
        input.focus();
        input.select();
        document.execCommand("copy");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Your earnings overview and stake status</p>
      </div>

      {/* 5 Key Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Today's Claim */}
        <div className="bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Today&apos;s Claim</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(todayClaim)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Claimed today</p>
        </div>

        {/* Total Claim */}
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Claim</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalClaimed)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Total staking yield claimed</p>
        </div>

        {/* Total Level Income */}
        <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-xl p-4">
          <p className="text-xs text-purple-600 font-medium">Total Level Income</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalCommissions)}</p>
          <p className="text-[10px] text-slate-400 mt-1">From 20-level commissions</p>
        </div>

        {/* Total Income */}
        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-600 font-medium">Income</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalIncome)}</p>
          <p className="text-[10px] text-slate-400 mt-1">All sources combined</p>
        </div>

        {/* Today's Level Income */}
        <div className="bg-gradient-to-br from-pink-50 to-white border border-pink-200 rounded-xl p-4">
          <p className="text-xs text-pink-600 font-medium">Today&apos;s Level</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(todayLevelIncome)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Level income today</p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Team Size</p>
          <p className="text-lg font-bold text-slate-900">{teamSize?.toString() || "0"}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">OSLO Price</p>
          <p className="text-lg font-bold text-blue-600">${formatPrice(dexPrice)}</p>
        </div>
        <Link href="/team" className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
          <p className="text-xs text-slate-500">Team / Investment</p>
          <p className="text-lg font-bold text-blue-600">View →</p>
        </Link>
        <Link href="/income" className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
          <p className="text-xs text-slate-500">Income Details</p>
          <p className="text-lg font-bold text-blue-600">View →</p>
        </Link>
      </div>

      {/* Personal Stake Card + How It Works */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StakingCard />
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">How It Works</h3>
          <div className="space-y-3 text-sm text-slate-500">
            <div className="flex gap-3">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">1</span>
              <p>Stake USDT (Tier 1: $10-$2,499 or Tier 2: $2,500-$5,000). Max $5,000 total per wallet.</p>
            </div>
            <div className="flex gap-3">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">2</span>
              <p>Claim yield as OSLO tokens (converted at DEX price)</p>
            </div>
            <div className="flex gap-3">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">3</span>
              <p>Sell OSLO on DEX for USDT (10% tax, 50% burn = price increases)</p>
            </div>
            <div className="flex gap-3">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">4</span>
              <p>Earnings capped at 3X your stake. Level income from 20 levels of referrals.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Link Locked — show prompt to stake first */}
      {address && !hasStaked && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Your Referral Link</h3>
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H8m13-9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0H3m18 0v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3" />
            </svg>
            <div>
              <p className="text-amber-600 font-medium text-sm">Make your first investment to unlock your referral link</p>
              <p className="text-slate-500 text-xs mt-1">
                Stake USDT to start earning and unlock your referral link to invite others.
              </p>
            </div>
          </div>
          <Link href="/stake" className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-500 font-medium">
            Go to Stake →
          </Link>
        </div>
      )}

      {/* Referral Link — shown after staking */}
      {address && hasStaked && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Your Referral Link</h3>
          <p className="text-sm text-slate-500 mb-4">Share this link to invite others and earn up to 20 levels of commission</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-600 font-mono truncate"
            />
            <button
              onClick={copyReferralLink}
              className={`px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-500">L1</p>
              <p className="text-sm font-bold text-green-600">30%</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-500">L2</p>
              <p className="text-sm font-bold text-green-600">10%</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-500">L3-5</p>
              <p className="text-sm font-bold text-green-600">5%</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-500">L6-10</p>
              <p className="text-sm font-bold text-green-600">2.5%</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-500">L11-20</p>
              <p className="text-sm font-bold text-green-600">1%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
