"use client";

import { StakingCard } from "@/components/dashboard/StakingCard";
import { ProtocolStats } from "@/components/dashboard/ProtocolStats";
import { useAccount, useReadContract } from "wagmi";
import { investmentEngineABI, osloDexABI, osloTokenABI, usdtABI, CONTRACTS } from "@/lib/contracts";
import { formatUSDT, formatOSLO, formatPrice } from "@/lib/utils/format";
import { useState } from "react";
import Link from "next/link";
import { bsc } from "wagmi/chains";

export default function DashboardPage() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  const { data: totalTurnover } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalProtocolTurnover",
  });

  const { data: totalActiveStakes } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalActiveStakes",
  });

  const { data: totalUsers } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalUsers",
  });

  // Check if user has staked (referral link only shown after staking)
  const { data: hasStaked } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "hasStaked",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // DEX Liquidity data
  const { data: dexPrice } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "getPrice",
    chainId: bsc.id,
    query: { refetchInterval: 15000 },
  });

  // Read ACTUAL USDT balance of the DEX contract (includes registration fees + staking deposits)
  const { data: dexUsdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "balanceOf",
    args: [CONTRACTS.OSLO_DEX],
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  const { data: osloReserve } = useReadContract({
    address: CONTRACTS.OSLO_TOKEN,
    abi: osloTokenABI,
    functionName: "balanceOf",
    args: [CONTRACTS.OSLO_DEX],
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  const { data: totalBurned } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "totalBurned",
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  const { data: burnCap } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "BURN_CAP",
    chainId: bsc.id,
  });

  const burnProgress = totalBurned && burnCap ? Number((totalBurned * 100n) / burnCap) : 0;

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
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Oslo Protocol overview and your stake status</p>
      </div>

      {/* Protocol Stats */}
      <ProtocolStats />

      {/* DEX Liquidity Pool */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">DEX Liquidity Pool</h2>
            <p className="text-sm text-gray-400">Registration fees &amp; sell taxes flow here</p>
          </div>
          <Link href="/dex" className="text-sm text-blue-400 hover:text-blue-300 font-medium">
            Go to DEX →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">USDT Liquidity</p>
            <p className="text-lg font-bold text-green-400">${formatUSDT(dexUsdtBalance)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">OSLO Reserve</p>
            <p className="text-lg font-bold text-purple-400">{formatOSLO(osloReserve)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">OSLO Price</p>
            <p className="text-lg font-bold text-blue-400">${formatPrice(dexPrice)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total Burned</p>
            <p className="text-lg font-bold text-red-400">{formatOSLO(totalBurned)}</p>
          </div>
        </div>

        {/* Burn Progress Bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Burn Progress</span>
            <span className="font-medium text-orange-400">{burnProgress.toFixed(2)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-500 h-2.5 rounded-full transition-all"
              style={{ width: `${Math.min(burnProgress, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Every sell burns 50% of OSLO tokens. Max burn: 9.99M OSLO (90% of supply).
          </p>
        </div>
      </div>

      {/* Protocol Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Total Value Locked</p>
          <p className="text-2xl font-bold text-white">${formatUSDT(totalActiveStakes)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Total Protocol Turnover</p>
          <p className="text-2xl font-bold text-white">${formatUSDT(totalTurnover)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Total Users</p>
          <p className="text-2xl font-bold text-white">{totalUsers?.toString() || "0"}</p>
        </div>
      </div>

      {/* Personal Stake Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StakingCard />
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
          <div className="space-y-3 text-sm text-gray-400">
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
              <p>Earnings capped at 3X your stake. Max $5,000 total investment per wallet.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Link Locked — show prompt to stake first */}
      {address && !hasStaked && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Your Referral Link</h3>
          <div className="flex items-center gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4">
            <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H8m13-9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0H3m18 0v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3" />
            </svg>
            <div>
              <p className="text-yellow-400 font-medium text-sm">Make your first investment to unlock your referral link</p>
              <p className="text-gray-400 text-xs mt-1">
                Stake USDT to start earning and unlock your referral link to invite others.
              </p>
            </div>
          </div>
          <Link href="/stake" className="inline-block mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium">
            Go to Stake →
          </Link>
        </div>
      )}

      {/* Referral Link — shown after staking */}
      {address && hasStaked && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Your Referral Link</h3>
          <p className="text-sm text-gray-400 mb-4">Share this link to invite others and earn up to 20 levels of commission</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 font-mono truncate"
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
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-xs text-gray-400">Level 1</p>
              <p className="text-sm font-bold text-green-400">30%</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-xs text-gray-400">Level 2</p>
              <p className="text-sm font-bold text-green-400">15%</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-xs text-gray-400">Level 3-20</p>
              <p className="text-sm font-bold text-green-400">1-10%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
