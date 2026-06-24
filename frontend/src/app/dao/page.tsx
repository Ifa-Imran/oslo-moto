"use client";

import { useDAO } from "@/hooks/useDAO";
import { useAccount } from "wagmi";
import { formatUSDT } from "@/lib/utils/format";
import { useEffect } from "react";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

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
  // Calculate next distribution timestamp (in seconds)
  const nextDistributionTimestamp = lastDistribution && Number(lastDistribution) > 0
    ? Number(lastDistribution) + cooldownSecs
    : 0;

  const allRequirementsMet =
    Number(teamSize) >= 250 &&
    Number(legCount) >= 3 &&
    Number(teamVolume) / 1e18 >= 25000;

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
        <p className="text-slate-500 mt-1">Elite governance with monthly royalty distribution</p>
      </div>

      {/* DAO Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-500">Qualified Members</p>
          <p className="text-2xl font-bold text-slate-900">
            {qualifiedCount?.toString() || "0"} / {maxMembers?.toString() || "200"}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-500">Monthly Pool (0.5%)</p>
          <p className="text-2xl font-bold text-green-600">
            ${formatUSDT(totalTurnover ? (totalTurnover * 50n) / 10000n : 0n)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-500">Per Member Share</p>
          <p className="text-2xl font-bold text-slate-900">
            ${qualifiedCount && qualifiedCount > 0n
              ? formatUSDT((totalTurnover ? (totalTurnover * 50n) / 10000n : 0n) / qualifiedCount)
              : "0.00"}
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-4">
          <p className="text-sm text-blue-100">Next Distribution</p>
          {nextDistributionTimestamp > 0 ? (
            <div className="mt-2">
              <CountdownTimer
                targetTimestamp={nextDistributionTimestamp}
                label=""
                expiredText="Available now!"
                compact
              />
              <p className="text-[10px] text-blue-200 mt-1">
                {new Date(nextDistributionTimestamp * 1000).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="text-lg font-bold text-white mt-1">Not yet distributed</p>
          )}
        </div>
      </div>

      {/* Your Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Your DAO Status</h3>
        {!address ? (
          <p className="text-slate-500">Connect your wallet to view your DAO status</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isQualified ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-slate-900 font-medium">
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
                current={Number(teamVolume) / 1e18}
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
              <div className="mt-4 bg-slate-100 rounded-lg p-4">
                <p className="text-sm text-slate-600 font-medium mb-2">What you need to qualify:</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  {allRequirementsMet ? (
                    <div className="space-y-3">
                      <li className="flex items-center gap-2">
                        <span className="text-green-600">✓</span>
                        <span className="text-green-600">All requirements met! Click below to qualify.</span>
                      </li>
                      <button
                        onClick={() => selfQualify()}
                        disabled={isSelfQualifying}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                      >
                        {isSelfQualifying ? "Qualifying..." : "Qualify Now"}
                      </button>
                      <p className="text-xs text-slate-400">
                        This will verify your team stats on-chain and add you to the DAO.
                      </p>
                    </div>
                  ) : (
                    <>
                      {Number(teamSize) < 250 && (
                        <li className="flex items-center gap-2">
                          <span className="text-amber-600">•</span>
                          <span>Build <span className="text-slate-900 font-bold">{(250 - Number(teamSize)).toLocaleString()}</span> more team members ({Number(teamSize).toLocaleString()}/250)</span>
                        </li>
                      )}
                      {Number(legCount) < 3 && (
                        <li className="flex items-center gap-2">
                          <span className="text-amber-600">•</span>
                          <span>Add <span className="text-slate-900 font-bold">{3 - Number(legCount)}</span> more active leg(s) ({Number(legCount)}/3)</span>
                        </li>
                      )}
                      {Number(teamVolume) / 1e18 < 25000 && (
                        <li className="flex items-center gap-2">
                          <span className="text-amber-600">•</span>
                          <span>Increase team volume by <span className="text-slate-900 font-bold">${(25000 - Number(teamVolume) / 1e18).toLocaleString()}</span> USDT (${(Number(teamVolume) / 1e18).toLocaleString()}/$25,000)</span>
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
        <div className="bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">DAO Royalty Income</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-100 rounded-lg p-4">
              <p className="text-sm text-slate-500">Your Pending Share</p>
              <p className="text-2xl font-bold text-green-600">
                ${formatUSDT(pendingRoyalty ?? 0n)}
              </p>
            </div>
            <div className="bg-slate-100 rounded-lg p-4">
              <p className="text-sm text-slate-500">Current Cycle Pool</p>
              <p className="text-2xl font-bold text-slate-900">
                ${formatUSDT(cyclePool ?? 0n)}
              </p>
              <p className="text-xs text-slate-400">Cycle #{currentCycle?.toString() || "0"}</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-4">
              <p className="text-sm text-slate-500">Qualified Members</p>
              <p className="text-2xl font-bold text-slate-900">
                {cycleMemberCount?.toString() || "0"}
              </p>
              <p className="text-xs text-slate-400">Sharing the pool</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={() => claimRoyalty()}
              disabled={isClaimingRoyalty || (pendingRoyalty ?? 0n) === 0n}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isClaimingRoyalty ? "Claiming..." : "Claim My Royalty"}
            </button>
            <button
              onClick={() => distributeRoyalties()}
              disabled={isDistributing}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isDistributing ? "Distributing..." : "Distribute to All Members"}
            </button>
          </div>

          {newCycleAvailable && (
            <p className="text-xs text-amber-600 mt-2">
              A new distribution cycle is available. Claim or distribute to start the new cycle.
            </p>
          )}
          <p className="text-xs text-slate-400 mt-2">
            Royalty = 0.5% of total protocol turnover, split equally among all qualified DAO members.
            New cycle every 30 days.
          </p>
        </div>
      )}

      {/* Requirements */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">DAO Qualification Requirements</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-500">
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
    <div className="bg-slate-100 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${met ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
          {met ? "Met" : "Not Met"}
        </span>
      </div>
      <p className="text-slate-900 font-medium">
        {current.toLocaleString()} / {required.toLocaleString()} {unit}
      </p>
      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
        <div
          className={`h-1.5 rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
