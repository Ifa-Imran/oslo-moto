"use client";

import { useDAO } from "@/hooks/useDAO";
import { useAccount } from "wagmi";
import { formatUSDT } from "@/lib/utils/format";
import { useEffect } from "react";

export default function DAOPage() {
  const { address } = useAccount();
  const { memberData, qualifiedCount, maxMembers, totalTurnover, lastDistribution, distributionCooldown, realTeamSize, realTeamVolume, realLegCount, selfQualify, isSelfQualifying, isSelfQualifySuccess, claimRoyalty, isClaimingRoyalty, isClaimRoyaltySuccess, distributeRoyalties, isDistributing, isDistributeSuccess, pendingRoyalty, newCycleAvailable, currentCycle, cyclePool, cycleMemberCount } = useDAO();

  const isQualified = memberData?.[0] ?? false;
  const slotNumber = memberData?.[1] ?? 0n;
  // Use real-time data from ReferralRegistry and InvestmentEngine
  const teamSize = realTeamSize ?? 0n;
  const teamVolume = realTeamVolume ?? 0n;
  const legCount = realLegCount ?? 0n;

  const cooldownSecs = distributionCooldown ? Number(distributionCooldown) : 30 * 24 * 60 * 60; // fallback to 30 days
  const nextDistribution = lastDistribution
    ? new Date(Number(lastDistribution) * 1000 + cooldownSecs * 1000).toLocaleString()
    : "N/A";

  const allRequirementsMet =
    Number(teamSize) >= 250 &&
    Number(legCount) >= 3 &&
    Number(teamVolume) / 1e6 >= 25000;

  // Auto-refetch page data after successful qualification or claim
  useEffect(() => {
    if (isSelfQualifySuccess || isClaimRoyaltySuccess || isDistributeSuccess) {
      window.location.reload();
    }
  }, [isSelfQualifySuccess, isClaimRoyaltySuccess, isDistributeSuccess]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">DAO</h1>
        <p className="text-gray-400 mt-1">Elite governance with monthly royalty distribution</p>
      </div>

      {/* DAO Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Qualified Members</p>
          <p className="text-2xl font-bold text-white">
            {qualifiedCount?.toString() || "0"} / {maxMembers?.toString() || "200"}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Monthly Pool (0.5%)</p>
          <p className="text-2xl font-bold text-green-400">
            ${formatUSDT(totalTurnover ? (totalTurnover * 50n) / 10000n : 0n)}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Per Member Share</p>
          <p className="text-2xl font-bold text-white">
            ${qualifiedCount && qualifiedCount > 0n
              ? formatUSDT((totalTurnover ? (totalTurnover * 50n) / 10000n : 0n) / qualifiedCount)
              : "0.00"}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Next Distribution</p>
          <p className="text-lg font-bold text-white">{nextDistribution}</p>
        </div>
      </div>

      {/* Your Status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Your DAO Status</h3>
        {!address ? (
          <p className="text-gray-400">Connect your wallet to view your DAO status</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isQualified ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-white font-medium">
                {isQualified ? `Qualified (Slot #${slotNumber.toString()})` : "Not Qualified"}
              </span>
            </div>

            {/* Qualification Progress */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <QualificationItem
                label="Team Size"
                current={Number(teamSize)}
                required={250}
                unit="members"
              />
              <QualificationItem
                label="Team Volume"
                current={Number(teamVolume) / 1e6}
                required={25000}
                unit="USDT"
              />
              <QualificationItem
                label="Active Legs"
                current={Number(legCount)}
                required={3}
                unit="legs"
              />
            </div>
            
            {/* Summary of what's needed */}
            {!isQualified && address && (
              <div className="mt-4 bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-300 font-medium mb-2">What you need to qualify:</p>
                <ul className="space-y-1 text-xs text-gray-400">
                  {allRequirementsMet ? (
                    <div className="space-y-3">
                      <li className="flex items-center gap-2">
                        <span className="text-green-400">✓</span>
                        <span className="text-green-400">All requirements met! Click below to qualify.</span>
                      </li>
                      <button
                        onClick={() => selfQualify()}
                        disabled={isSelfQualifying}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                      >
                        {isSelfQualifying ? "Qualifying..." : "Qualify Now"}
                      </button>
                      <p className="text-xs text-gray-500">
                        This will verify your team stats on-chain and add you to the DAO.
                      </p>
                    </div>
                  ) : (
                    <>
                      {Number(teamSize) < 250 && (
                        <li className="flex items-center gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Build <span className="text-white font-bold">{(250 - Number(teamSize)).toLocaleString()}</span> more team members ({Number(teamSize).toLocaleString()}/250)</span>
                        </li>
                      )}
                      {Number(legCount) < 3 && (
                        <li className="flex items-center gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Add <span className="text-white font-bold">{3 - Number(legCount)}</span> more active leg(s) ({Number(legCount)}/3)</span>
                        </li>
                      )}
                      {Number(teamVolume) / 1e6 < 25000 && (
                        <li className="flex items-center gap-2">
                          <span className="text-yellow-400">•</span>
                          <span>Increase team volume by <span className="text-white font-bold">${(25000 - Number(teamVolume) / 1e6).toLocaleString()}</span> USDT (${(Number(teamVolume) / 1e6).toLocaleString()}/$25,000)</span>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Royalty Income Section — only for qualified members */}
      {address && isQualified && (
        <div className="bg-gradient-to-br from-green-900/30 to-gray-900 border border-green-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">DAO Royalty Income</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Your Pending Share</p>
              <p className="text-2xl font-bold text-green-400">
                ${formatUSDT(pendingRoyalty ?? 0n)}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Current Cycle Pool</p>
              <p className="text-2xl font-bold text-white">
                ${formatUSDT(cyclePool ?? 0n)}
              </p>
              <p className="text-xs text-gray-500">Cycle #{currentCycle?.toString() || "0"}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Qualified Members</p>
              <p className="text-2xl font-bold text-white">
                {cycleMemberCount?.toString() || "0"}
              </p>
              <p className="text-xs text-gray-500">Sharing the pool</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={() => claimRoyalty()}
              disabled={isClaimingRoyalty || (pendingRoyalty ?? 0n) === 0n}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isClaimingRoyalty ? "Claiming..." : "Claim My Royalty"}
            </button>
            <button
              onClick={() => distributeRoyalties()}
              disabled={isDistributing}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isDistributing ? "Distributing..." : "Distribute to All Members"}
            </button>
          </div>

          {newCycleAvailable && (
            <p className="text-xs text-yellow-400 mt-2">
              A new distribution cycle is available. Claim or distribute to start the new cycle.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Royalty = 0.5% of total protocol turnover, split equally among all qualified DAO members.
            New cycle every 30 days.
          </p>
        </div>
      )}

      {/* Requirements */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">DAO Qualification Requirements</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
          <div className="space-y-2">
            <p className="text-white font-medium">Team Requirements</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Minimum 250 team members</li>
              <li>Minimum 3 active legs (no single leg dominance)</li>
              <li>Team volume of at least $25,000 USDT</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-white font-medium">Benefits</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Monthly share of 0.5% protocol turnover</li>
              <li>Maximum 200 DAO members</li>
              <li>Monthly verification required</li>
              <li>Equal share among all qualified members</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function QualificationItem({
  label,
  current,
  required,
  unit,
}: {
  label: string;
  current: number;
  required: number;
  unit: string;
}) {
  const progress = Math.min((current / required) * 100, 100);
  const met = current >= required;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${met ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}>
          {met ? "Met" : "Not Met"}
        </span>
      </div>
      <p className="text-white font-medium">
        {current.toLocaleString()} / {required.toLocaleString()} {unit}
      </p>
      <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
        <div
          className={`h-1.5 rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
