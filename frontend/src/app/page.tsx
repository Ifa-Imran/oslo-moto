"use client";

import { StakingCard } from "@/components/dashboard/StakingCard";
import { ProtocolStats } from "@/components/dashboard/ProtocolStats";
import { useAccount, useReadContract } from "wagmi";
import { investmentEngineABI, osloDexABI, osloTokenABI, usdtABI, referralRegistryABI, CONTRACTS } from "@/lib/contracts";
import { formatUSDT, formatOSLO, formatPrice } from "@/lib/utils/format";
import { useState } from "react";
import Link from "next/link";
import { bsc } from "wagmi/chains";

export default function DashboardPage() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  // My Team Size (all downlines up to 20 levels)
  const { data: teamSize } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getTeamSize",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Contract parameters for How It Works section (read from chain)
  const { data: tier1Min } = useReadContract({ address: CONTRACTS.INVESTMENT_ENGINE, abi: investmentEngineABI, functionName: "TIER1_MIN", chainId: bsc.id });
  const { data: tier1Max } = useReadContract({ address: CONTRACTS.INVESTMENT_ENGINE, abi: investmentEngineABI, functionName: "TIER1_MAX", chainId: bsc.id });
  const { data: tier2Min } = useReadContract({ address: CONTRACTS.INVESTMENT_ENGINE, abi: investmentEngineABI, functionName: "TIER2_MIN", chainId: bsc.id });
  const { data: tier2Max } = useReadContract({ address: CONTRACTS.INVESTMENT_ENGINE, abi: investmentEngineABI, functionName: "TIER2_MAX", chainId: bsc.id });
  const { data: maxTotalStake } = useReadContract({ address: CONTRACTS.INVESTMENT_ENGINE, abi: investmentEngineABI, functionName: "MAX_TOTAL_STAKE_PER_USER", chainId: bsc.id });

  const fmtUSD = (val: bigint | undefined) => val ? `$${Number(val) / 1e18}` : "$0";

  // Level commission rates from LevelIncomeSystem._initLevels() (immutable, set in constructor)
  // L1: 3000 bps, L2: 1000 bps, L3-5: 500 bps, L6-10: 250 bps, L11-20: 100 bps

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
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Oslo Protocol overview and your stake status</p>
      </div>

      {/* Protocol Stats */}
      <ProtocolStats />

      {/* DEX Liquidity Pool */}
      <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">DEX Liquidity Pool</h2>
            <p className="text-sm text-slate-500">Registration fees &amp; sell taxes flow here</p>
          </div>
          <Link href="/dex" className="text-sm text-blue-600 hover:text-blue-500 font-medium">
            Go to DEX →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">USDT Liquidity</p>
            <p className="text-lg font-bold text-green-600">${formatUSDT(dexUsdtBalance)}</p>
          </div>
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">OSLO Reserve</p>
            <p className="text-lg font-bold text-purple-600">{formatOSLO(osloReserve)}</p>
          </div>
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">OSLO Price</p>
            <p className="text-lg font-bold text-blue-600">${formatPrice(dexPrice)}</p>
          </div>
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">Total Burned</p>
            <p className="text-lg font-bold text-red-600">{formatOSLO(totalBurned)}</p>
          </div>
        </div>

        {/* Burn Progress Bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Burn Progress</span>
            <span className="font-medium text-orange-600">{burnProgress.toFixed(2)}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-500 h-2.5 rounded-full transition-all"
              style={{ width: `${Math.min(burnProgress, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Every sell burns 50% of OSLO tokens. Max burn: 9.99M OSLO (90% of supply).
          </p>
        </div>
      </div>

      {/* My Team Size */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm text-slate-500">My Team Size</p>
        <p className="text-2xl font-bold text-slate-900">{teamSize?.toString() || "0"}</p>
      </div>

      {/* Personal Stake Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StakingCard />
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">How It Works</h3>
          <div className="space-y-3 text-sm text-slate-500">
            <div className="flex gap-3">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">1</span>
              <p>Stake USDT (Tier 1: {fmtUSD(tier1Min)}-{fmtUSD(tier1Max)} or Tier 2: {fmtUSD(tier2Min)}-{fmtUSD(tier2Max)}). Max {fmtUSD(maxTotalStake)} total per wallet.</p>
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
              <p>Earnings capped at 3X your stake. Max {fmtUSD(maxTotalStake)} total investment per wallet.</p>
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
