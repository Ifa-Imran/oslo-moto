"use client";

import { useAccount, useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";
import {
  levelIncomeSystemABI,
  osloTokenABI,
  referralRegistryABI,
  CONTRACTS,
} from "@/lib/contracts";
import { useStaking } from "@/hooks/useStaking";
import { useLeadershipBonus } from "@/hooks/useLeadershipBonus";
import { useTodayStats } from "@/hooks/useTodayStats";
import { formatUSDT, formatOSLO } from "@/lib/utils/format";
import { useEffect } from "react";
import toast from "react-hot-toast";

const RANK_NAMES = ["OSLO 1", "OSLO 2", "OSLO 3", "OSLO 4", "OSLO 5", "OSLO 6", "OSLO 7"];

// Level configuration from LevelIncomeSystem contract (immutable, set in constructor)
const LEVEL_CONFIG = [
  { level: 1, rate: 3000, directsRequired: 1 },
  { level: 2, rate: 1000, directsRequired: 1 },
  { level: 3, rate: 500, directsRequired: 1 },
  { level: 4, rate: 500, directsRequired: 2 },
  { level: 5, rate: 500, directsRequired: 2 },
  { level: 6, rate: 250, directsRequired: 2 },
  { level: 7, rate: 250, directsRequired: 3 },
  { level: 8, rate: 250, directsRequired: 3 },
  { level: 9, rate: 250, directsRequired: 3 },
  { level: 10, rate: 250, directsRequired: 5 },
  { level: 11, rate: 100, directsRequired: 5 },
  { level: 12, rate: 100, directsRequired: 5 },
  { level: 13, rate: 100, directsRequired: 5 },
  { level: 14, rate: 100, directsRequired: 5 },
  { level: 15, rate: 100, directsRequired: 7 },
  { level: 16, rate: 100, directsRequired: 7 },
  { level: 17, rate: 100, directsRequired: 7 },
  { level: 18, rate: 100, directsRequired: 7 },
  { level: 19, rate: 100, directsRequired: 7 },
  { level: 20, rate: 100, directsRequired: 7 },
];

export default function IncomePage() {
  const { address } = useAccount();

  // Staking data
  const {
    claimableYield,
    claimYield,
    isClaiming: isStakeClaiming,
    isClaimSuccess,
    claimError,
    resetClaim,
    totalClaimed,
    accruedYield,
    userStake,
    refetchYield,
  } = useStaking();

  // Today's stats
  const { todayClaim, todayLevelIncome, totalCommissions: totalLevelIncome } = useTodayStats();

  // Direct downline count (to show which levels are unlocked)
  const { data: directCount } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getDirectDownlineCount",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Leadership bonus data
  const {
    lastWeekBig,
    lastStats,
    lastWeekClaimed,
    claimWeeklyBonus,
    isClaiming: isBonusClaiming,
    totalBonusPaid,
    ranks,
    refetchAll,
  } = useLeadershipBonus();

  // Level commissions earned (auto-distributed as OSLO) — also from useTodayStats
  const { data: commissionsEarned } = useReadContract({
    address: CONTRACTS.LEVEL_INCOME_SYSTEM,
    abi: levelIncomeSystemABI,
    functionName: "totalCommissionsEarned",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // OSLO token balance
  const { data: osloBalance } = useReadContract({
    address: CONTRACTS.OSLO_TOKEN,
    abi: osloTokenABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  // Show toast on claim success
  useEffect(() => {
    if (isClaimSuccess) {
      toast.success("Yield claimed successfully! OSLO tokens sent to your wallet.", {
        duration: 6000,
        icon: "✅",
      });
      refetchYield();
      const timer = setTimeout(() => resetClaim(), 6000);
      return () => clearTimeout(timer);
    }
  }, [isClaimSuccess, refetchYield, resetClaim]);

  // Show toast on claim error
  useEffect(() => {
    if (claimError) {
      toast.error(`Claim failed: ${claimError.message?.slice(0, 100) || "Unknown error"}`, {
        duration: 8000,
      });
      const timer = setTimeout(() => resetClaim(), 8000);
      return () => clearTimeout(timer);
    }
  }, [claimError, resetClaim]);

  // Refetch bonus data after claim completes
  useEffect(() => {
    if (!isBonusClaiming) {
      refetchAll();
    }
  }, [isBonusClaiming, refetchAll]);

  if (!address) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Income</h1>
          <p className="text-slate-500 mt-1">View and claim all your earnings in one place</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-500">Connect your wallet to view your earnings</p>
        </div>
      </div>
    );
  }

  // Staking yield data
  const stakeActiveStake = userStake?.activeStake ?? 0n;
  const stakeTotalEarnings = userStake?.totalEarnings ?? 0n;
  const stakeIsActive = userStake?.isActive ?? false;
  const stakeClaimable = claimableYield ?? 0n;
  const totalClaimedYield = totalClaimed ?? 0n;

  // Leadership bonus data
  const lastWeekRank = lastStats?.rank ?? 0;
  const estimatedBonus =
    lastStats && lastWeekRank > 0 && ranks[lastWeekRank - 1]
      ? (lastStats.totalVolume * ranks[lastWeekRank - 1].bonusRateBps) / 10000n
      : 0n;

  // Totals — prefer useTodayStats value (auto-refreshing), fall back to direct read
  const totalCommissions = totalLevelIncome > 0n ? totalLevelIncome : (commissionsEarned ?? 0n);
  const totalBonus = totalBonusPaid ?? 0n;
  const totalAllEarnings = totalClaimedYield + totalCommissions + totalBonus;

  const handleClaimYield = () => {
    claimYield();
  };

  const handleClaimBonus = () => {
    claimWeeklyBonus(lastWeekBig);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Income</h1>
        <p className="text-slate-500 mt-1">View and claim all your earnings in one place</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600">Today&apos;s Claim</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(todayClaim)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Claimed today</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-600">Total Staking Claimed</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalClaimedYield)}</p>
          <p className="text-[10px] text-slate-400 mt-1">As OSLO tokens</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-xl p-4 ring-2 ring-purple-200">
          <p className="text-xs text-purple-600 font-semibold">Level Income Total</p>
          <p className="text-xl font-bold text-purple-700 mt-1">${formatUSDT(totalCommissions)}</p>
          <p className="text-[10px] text-slate-400 mt-1">From 20-level commissions</p>
        </div>
        <div className="bg-gradient-to-br from-pink-50 to-white border border-pink-200 rounded-xl p-4">
          <p className="text-xs text-pink-600">Today&apos;s Level Income</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(todayLevelIncome)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Earned today</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-600">Leadership Bonus</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalBonus)}</p>
          <p className="text-[10px] text-slate-400 mt-1">As OSLO tokens</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-600">Total Income</p>
          <p className="text-xl font-bold text-slate-900 mt-1">${formatUSDT(totalAllEarnings)}</p>
          <p className="text-[10px] text-slate-400 mt-1">All sources</p>
        </div>
      </div>

      {/* OSLO Balance */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Your OSLO Balance</h3>
            <p className="text-sm text-slate-500 mt-1">
              All earnings are paid in OSLO tokens. Sell on DEX for USDT anytime.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-purple-600">{formatOSLO(osloBalance)}</p>
            <p className="text-xs text-slate-400">OSLO</p>
          </div>
        </div>
      </div>

      {/* Claimable Income Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Claimable Income</h2>

        {/* Staking Yield Claim */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 border border-green-300 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Staking Yield</h3>
                <p className="text-xs text-slate-500">Daily yield from your active stakes</p>
              </div>
            </div>
            {isClaimSuccess && (
              <span className="text-green-600 text-sm font-medium animate-pulse">Claimed!</span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Active Stake</p>
              <p className="text-sm font-bold text-slate-900">${formatUSDT(stakeActiveStake)}</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total Earnings</p>
              <p className="text-sm font-bold text-green-600">${formatUSDT(stakeTotalEarnings)}</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total Yield Generated</p>
              <p className="text-sm font-bold text-amber-600">${formatUSDT(accruedYield)}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600">Claimable Now</p>
              <p className="text-sm font-bold text-green-600">${formatUSDT(stakeClaimable)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
            <span className={`w-2 h-2 rounded-full ${stakeIsActive ? "bg-green-500" : "bg-red-500"}`} />
            <span>Status: {stakeIsActive ? "Active" : stakeActiveStake > 0n ? "Capped (3X reached)" : "No active stake"}</span>
          </div>

          <button
            onClick={handleClaimYield}
            disabled={stakeClaimable === 0n || isStakeClaiming || !stakeIsActive}
            className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isStakeClaiming ? "Claiming..." : `Claim ${formatUSDT(stakeClaimable)} USDT Yield (→ OSLO)`}
          </button>
        </div>

        {/* Leadership Bonus Claim */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 border border-purple-300 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Leadership Bonus</h3>
                <p className="text-xs text-slate-500">Weekly team turnover reward (highest rank)</p>
              </div>
            </div>
            {!isBonusClaiming && lastWeekClaimed && lastWeekRank > 0 && (
              <span className="text-green-600 text-sm font-medium animate-pulse">Claimed!</span>
            )}
          </div>

          {lastWeekRank > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Last Week Rank</p>
                  <p className="text-sm font-bold text-purple-600">{RANK_NAMES[lastWeekRank - 1]}</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Team Volume</p>
                  <p className="text-sm font-bold text-slate-900">${formatUSDT(lastStats?.totalVolume ?? 0n)}</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Bonus Rate</p>
                  <p className="text-sm font-bold text-slate-900">
                    {ranks[lastWeekRank - 1] ? (Number(ranks[lastWeekRank - 1].bonusRateBps) / 100).toFixed(2) : 0}%
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs text-purple-600">Est. Bonus</p>
                  <p className="text-sm font-bold text-purple-600">${formatUSDT(estimatedBonus)}</p>
                </div>
              </div>

              {lastWeekClaimed ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Already claimed — {RANK_NAMES[lastWeekRank - 1]} bonus received
                </div>
              ) : (
                <button
                  onClick={handleClaimBonus}
                  disabled={isBonusClaiming}
                  className="w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {isBonusClaiming ? "Claiming..." : `Claim ${RANK_NAMES[lastWeekRank - 1]} Bonus (→ OSLO)`}
                </button>
              )}
            </>
          ) : (
            <div className="text-slate-500">
              <p className="text-sm">No leadership bonus available for last week.</p>
              <p className="text-xs mt-1">
                Build your team volume to qualify for weekly leadership rewards.
                Check the <a href="/leadership" className="text-blue-600 hover:underline">Leadership page</a> for details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Distributed Income */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Auto-Distributed Income</h2>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Level Commissions</h3>
              <p className="text-xs text-slate-500">Auto-distributed to your wallet as OSLO when downlines claim yield</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total Earned</p>
              <p className="text-lg font-bold text-blue-600">${formatUSDT(totalCommissions)}</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Distribution</p>
              <p className="text-sm font-bold text-slate-900">Automatic (no claim needed)</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Paid In</p>
              <p className="text-sm font-bold text-slate-900">OSLO tokens</p>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            When your downline members claim their staking yield, you automatically receive level commissions
            (up to 20 levels deep) as OSLO tokens in your wallet.
          </p>
        </div>

        {/* Level Income Breakdown Table */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Level Income Breakdown</h3>
          <div className="mb-4 flex items-center gap-4">
            <div className="bg-slate-100 rounded-lg px-4 py-2">
              <p className="text-xs text-slate-500">Your Direct Referrals</p>
              <p className="text-lg font-bold text-slate-900">{directCount?.toString() || "0"}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2">
              <p className="text-xs text-purple-600">Total Level Income</p>
              <p className="text-lg font-bold text-purple-700">${formatUSDT(totalCommissions)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Level</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Rate</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Directs Required</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {LEVEL_CONFIG.map((cfg) => {
                  const userDirects = Number(directCount ?? 0n);
                  const unlocked = userDirects >= cfg.directsRequired;
                  return (
                    <tr key={cfg.level} className="border-b border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-900">L{cfg.level}</td>
                      <td className="py-2 px-3 text-green-600 font-medium">{(cfg.rate / 100).toFixed(cfg.rate % 100 === 0 ? 0 : 1)}%</td>
                      <td className="py-2 px-3 text-slate-600">{cfg.directsRequired}</td>
                      <td className="py-2 px-3">
                        {unlocked ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500" /> Unlocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-slate-300" /> Need {cfg.directsRequired - userDirects} more
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Level commissions are auto-distributed as OSLO tokens when your downline members claim their staking yield.
            Unlock more levels by increasing your direct referrals.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 border border-orange-300 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9-5 9 5M3 7h18" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">DAO Royalties</h3>
              <p className="text-xs text-slate-500">Monthly royalty distribution for qualified DAO members</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Distribution</p>
              <p className="text-sm font-bold text-slate-900">Automatic (keeper)</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Paid In</p>
              <p className="text-sm font-bold text-slate-900">USDT</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Qualification</p>
              <p className="text-sm font-bold text-slate-900">250 members, 3 legs, $25K volume</p>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            DAO royalties are distributed monthly to qualified members. Check the{" "}
            <a href="/dao" className="text-blue-600 hover:underline">DAO page</a> to see your qualification status.
          </p>
        </div>
      </div>
    </div>
  );
}
