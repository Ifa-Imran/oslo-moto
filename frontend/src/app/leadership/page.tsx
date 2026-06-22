"use client";

import { useLeadershipBonus } from "@/hooks/useLeadershipBonus";
import { useReferral } from "@/hooks/useReferral";
import { useAccount } from "wagmi";
import { formatUSDT, shortenAddress } from "@/lib/utils/format";

const RANK_NAMES = ["OSLO 1", "OSLO 2", "OSLO 3", "OSLO 4", "OSLO 5", "OSLO 6", "OSLO 7"];
const RANK_COLORS = [
  "from-blue-500 to-blue-700",
  "from-cyan-500 to-cyan-700",
  "from-teal-500 to-teal-700",
  "from-green-500 to-green-700",
  "from-yellow-500 to-yellow-700",
  "from-orange-500 to-orange-700",
  "from-purple-500 to-purple-700",
];

export default function LeadershipBonusPage() {
  const { address } = useAccount();
  const { downlineCount, teamSize } = useReferral();
  const {
    currentWeek,
    lastWeekBig,
    ranks,
    totalBonusPaid,
    currentStats,
    lastStats,
    lastWeekClaimed,
    claimWeeklyBonus,
    isClaiming,
  } = useLeadershipBonus();

  const currentRank = currentStats?.rank ?? 0;
  const lastWeekRank = lastStats?.rank ?? 0;
  const canClaimLastWeek = lastWeekRank > 0 && !lastWeekClaimed && address;

  // Calculate next rank progress
  const nextRankIndex = currentRank; // 0-based: if currentRank=1 (OSLO 1), next is index 1 (OSLO 2)
  const nextRank = nextRankIndex < 7 ? ranks[nextRankIndex] : null;
  const currentVolume = currentStats?.totalVolume ?? 0n;
  const volumeNeeded = nextRank ? (nextRank.requiredTurnover > currentVolume ? nextRank.requiredTurnover - currentVolume : 0n) : 0n;
  const progressPct = nextRank ? Math.min(Number((currentVolume * 100n) / nextRank.requiredTurnover), 100) : 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Leadership Bonus</h1>
        <p className="text-gray-400 mt-1">
          Weekly team turnover rewards with 40/60 power-leg rule — highest rank only payout
        </p>
      </div>

      {/* Current Week Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Current Week</p>
            <p className="text-3xl font-bold text-white">#{currentWeek || "..."}</p>
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-sm">Your Current Rank</p>
            <p className="text-3xl font-bold text-white">
              {currentRank > 0 ? RANK_NAMES[currentRank - 1] : "Unranked"}
            </p>
          </div>
        </div>
        {currentStats && currentStats.totalVolume > 0n && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs">Total Volume</p>
              <p className="text-lg font-bold text-white">${formatUSDT(currentStats.totalVolume)}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs">Power Leg (max 40%)</p>
              <p className="text-lg font-bold text-white">${formatUSDT(currentStats.powerLegVolume)}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-blue-100 text-xs">Other Legs</p>
              <p className="text-lg font-bold text-white">${formatUSDT(currentStats.otherLegsVolume)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Team Stats & Next Rank Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Your Team</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Direct Downlines (Legs)</span>
              <span className="text-white font-bold text-lg">{downlineCount?.toString() || "0"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Total Team Size (20 levels)</span>
              <span className="text-white font-bold text-lg">{teamSize?.toString() || "0"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Current Week Volume</span>
              <span className="text-white font-bold text-lg">${formatUSDT(currentVolume)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Power Leg Volume</span>
              <span className="text-white font-bold text-lg">${formatUSDT(currentStats?.powerLegVolume ?? 0n)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Other Legs Volume</span>
              <span className="text-white font-bold text-lg">${formatUSDT(currentStats?.otherLegsVolume ?? 0n)}</span>
            </div>
          </div>
          {(!downlineCount || downlineCount === 0n) && address && (
            <p className="text-xs text-yellow-400 mt-3">
              You have no direct downlines yet. Share your referral link to build your team!
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">
            {currentRank === 0 ? "First Rank Progress" : currentRank === 7 ? "Max Rank Achieved!" : "Next Rank Progress"}
          </h3>
          {currentRank < 7 && nextRank ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">
                  {currentRank > 0 ? `${RANK_NAMES[currentRank - 1]} → ${RANK_NAMES[nextRankIndex]}` : `→ ${RANK_NAMES[0]}`}
                </span>
                <span className={`text-sm font-bold ${progressPct >= 100 ? "text-green-400" : "text-blue-400"}`}>
                  {progressPct}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${progressPct >= 100 ? "bg-green-500" : "bg-gradient-to-r from-blue-500 to-purple-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <p className="text-xs text-gray-400">Required Turnover</p>
                  <p className="text-sm font-bold text-white">${formatUSDT(nextRank.requiredTurnover)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Your Volume</p>
                  <p className="text-sm font-bold text-white">${formatUSDT(currentVolume)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Volume Still Needed</p>
                  <p className="text-sm font-bold text-yellow-400">${formatUSDT(volumeNeeded)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Bonus Rate at Rank</p>
                  <p className="text-sm font-bold text-green-400">{(Number(nextRank.bonusRateBps) / 100).toFixed(2)}%</p>
                </div>
              </div>
              {volumeNeeded > 0n && (
                <p className="text-xs text-gray-500 pt-1">
                  Build your team to increase weekly staking volume. Remember: max 40% can come from your power leg.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-br ${RANK_COLORS[6]} flex items-center justify-center text-2xl font-bold text-white mb-3`}>
                7
              </div>
              <p className="text-white font-bold text-lg">{RANK_NAMES[6]}</p>
              <p className="text-green-400 text-sm mt-1">Maximum rank achieved!</p>
            </div>
          )}
        </div>
      </div>

      {/* Rank Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Rank Structure</h3>
          <p className="text-sm text-gray-400 mt-1">
            Highest rank achieved is paid non-cumulatively each week
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-sm">
                <th className="text-left p-3 font-medium">Rank</th>
                <th className="text-right p-3 font-medium">Required Turnover</th>
                <th className="text-right p-3 font-medium">Bonus Rate</th>
                <th className="text-right p-3 font-medium">Max Power Leg (40%)</th>
                <th className="text-center p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((rank, i) => {
                const isAchieved = currentRank >= i + 1;
                const maxPowerContribution = (rank.requiredTurnover * 40n) / 100n;
                return (
                  <tr
                    key={i}
                    className={`border-b border-gray-800/50 ${isAchieved ? "bg-gray-800/50" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${RANK_COLORS[i]} flex items-center justify-center text-xs font-bold text-white`}
                        >
                          {i + 1}
                        </div>
                        <span className={`font-medium ${isAchieved ? "text-white" : "text-gray-400"}`}>
                          {RANK_NAMES[i]}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-gray-300">
                      ${formatUSDT(rank.requiredTurnover)}
                    </td>
                    <td className="p-3 text-right text-gray-300">
                      {(Number(rank.bonusRateBps) / 100).toFixed(2)}%
                    </td>
                    <td className="p-3 text-right text-gray-400">
                      ${formatUSDT(maxPowerContribution)}
                    </td>
                    <td className="p-3 text-center">
                      {isAchieved ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900 text-green-400">
                          Achieved
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-800 text-gray-500">
                          Locked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ranks.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Loading rank data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Last Week — Claim Section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Last Week Bonus</h3>
          <span className="text-sm text-gray-400">Week #{currentWeek > 0 ? currentWeek - 1 : "..."}</span>
        </div>

        {!address ? (
          <p className="text-gray-400">Connect your wallet to view and claim your bonus</p>
        ) : lastWeekRank === 0 ? (
          <div className="text-gray-400">
            <p>You did not achieve a rank last week.</p>
            {lastStats && lastStats.totalVolume > 0n && (
              <p className="text-sm mt-2">
                Your total volume was ${formatUSDT(lastStats.totalVolume)}, but it did not meet
                the 40/60 qualification for any rank.
              </p>
            )}
          </div>
        ) : lastWeekClaimed ? (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-white font-medium">
              Already claimed — {RANK_NAMES[lastWeekRank - 1]} bonus received
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full bg-gradient-to-br ${RANK_COLORS[lastWeekRank - 1]} flex items-center justify-center text-sm font-bold text-white`}
              >
                {lastWeekRank}
              </div>
              <div>
                <p className="text-white font-medium">
                  {RANK_NAMES[lastWeekRank - 1]} achieved!
                </p>
                <p className="text-sm text-gray-400">
                  Bonus: {(Number(ranks[lastWeekRank - 1]?.bonusRateBps ?? 0n) / 100).toFixed(2)}% of ${formatUSDT(lastStats?.totalVolume)}
                </p>
              </div>
            </div>

            {lastStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Total Volume</p>
                  <p className="text-sm font-bold text-white">${formatUSDT(lastStats.totalVolume)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Power Leg</p>
                  <p className="text-sm font-bold text-white">${formatUSDT(lastStats.powerLegVolume)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Other Legs</p>
                  <p className="text-sm font-bold text-white">${formatUSDT(lastStats.otherLegsVolume)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Est. Bonus (USDT)</p>
                  <p className="text-sm font-bold text-green-400">
                    ${formatUSDT(
                      (lastStats.totalVolume * (ranks[lastWeekRank - 1]?.bonusRateBps ?? 0n)) / 10000n
                    )}
                  </p>
                </div>
              </div>
            )}

            {lastStats && lastStats.powerLegAddress !== "0x0000000000000000000000000000000000000000" && (
              <p className="text-xs text-gray-500">
                Power Leg: {shortenAddress(lastStats.powerLegAddress)}
              </p>
            )}

            <button
              onClick={() => claimWeeklyBonus(lastWeekBig)}
              disabled={isClaiming}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isClaiming ? "Claiming..." : "Claim Weekly Bonus"}
            </button>
          </div>
        )}
      </div>

      {/* Total Bonus Paid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-sm text-gray-400">Total Bonus Earned (USDT)</p>
          <p className="text-3xl font-bold text-green-400 mt-2">
            ${formatUSDT(totalBonusPaid)}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-white mb-3">How It Works</h4>
          <ul className="space-y-2 text-xs text-gray-400">
            <li>
              <span className="text-blue-400">•</span> Volume is tracked weekly from all staking activity in your downline (20 levels)
            </li>
            <li>
              <span className="text-blue-400">•</span> Power Leg = your highest-volume leg; capped at 40% of required turnover
            </li>
            <li>
              <span className="text-blue-400">•</span> Remaining 60%+ must come from all other legs combined
            </li>
            <li>
              <span className="text-blue-400">•</span> Only the highest rank achieved is paid (non-cumulative)
            </li>
            <li>
              <span className="text-blue-400">•</span> Bonus is paid in OSLO tokens at current DEX price
            </li>
            <li>
              <span className="text-blue-400">•</span> Claim last week&apos;s bonus anytime — no expiry
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
