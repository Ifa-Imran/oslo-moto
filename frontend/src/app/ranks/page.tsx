"use client";

import { useAccount } from "wagmi";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { RankBadge } from "@/components/ui/RankBadge";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { StatCard } from "@/components/ui/StatCard";
import { AddressChip } from "@/components/ui/AddressChip";
import { useRankSystemReads, useWeeklyTurnover, useLegTurnover, useIsRankQualified, useRankSystemWrites } from "@/hooks/useRankSystem";
import { useReferralReads } from "@/hooks/useReferral";
import { useAppStore } from "@/store/useAppStore";
import { formatToken, formatNumber, formatCompact, truncateAddress } from "@/lib/utils";
import {
  RANK_CONFIG,
  RANK_MAIN_LEG_MAX_PCT,
  RANK_OTHER_LEGS_MIN_PCT,
  WEEK_DURATION,
  GENESIS_TIMESTAMP,
} from "@/lib/constants";
import { Trophy, TrendingUp, Clock, Search, BarChart3, LineChart, PieChart, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useMemo } from "react";
import { type Address } from "viem";
import {
  LineChart as ReLineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

function getWeekEndTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const weeksSinceGenesis = Math.floor((now - GENESIS_TIMESTAMP) / WEEK_DURATION);
  return GENESIS_TIMESTAMP + (weeksSinceGenesis + 1) * WEEK_DURATION;
}

function LegRow({
  userAddress,
  legAddress,
  weekId,
}: {
  userAddress?: Address;
  legAddress: Address;
  weekId: number;
}) {
  const { data: legTurnover } = useLegTurnover(userAddress, weekId, legAddress);
  const { data: totalTurnover } = useWeeklyTurnover(userAddress, weekId);

  const legT = (legTurnover as bigint) || 0n;
  const totalT = (totalTurnover as bigint) || 0n;
  const pct = totalT > 0n ? Number((legT * 10000n) / totalT) / 100 : 0;
  const isOverCap = pct > RANK_MAIN_LEG_MAX_PCT;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
      <AddressChip address={legAddress} showCopy={false} />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-oslo-text-primary">
            ${formatToken(legT, 2)}
          </span>
          <span
            className={`text-xs font-medium ${
              isOverCap ? "text-oslo-error" : "text-oslo-text-muted"
            }`}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isOverCap ? "bg-oslo-error" : "bg-oslo-ice/60"
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function RanksPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useAppStore();
  const { currentWeekId, currentRank, pendingBonus, bonusPoolBalance, totalBonusesDistributed } = useRankSystemReads(address);
  const { claimRankBonus, isLoading } = useRankSystemWrites();

  // 40/60 leg ratio qualification
  const { data: isQualified } = useIsRankQualified(address);
  const { directReferrals } = useReferralReads(address);
  const directs = (directReferrals.data as Address[]) || [];

  const weekId = Number(currentWeekId.data || 0);
  const rank = Number(currentRank.data || 0);
  const bonus = pendingBonus.data as bigint | undefined;
  const poolBalance = bonusPoolBalance.data as bigint | undefined;
  const totalDist = totalBonusesDistributed.data as bigint | undefined;
  const weekEnd = getWeekEndTimestamp();

  // Current week turnover
  const { data: currentTurnover } = useWeeklyTurnover(address, weekId);

  const handleClaim = async () => {
    try {
      addToast({ title: "Claiming Rank Bonus...", status: "pending" });
      const tx = await claimRankBonus();
      addToast({ title: "Rank Bonus Claimed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Claim Failed",
        description: err?.message?.slice(0, 100),
        status: "error",
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-light">Weekly Ranks</h1>
          <p className="mt-1 text-sm text-oslo-text-secondary">
            Compete for weekly rank bonuses based on team turnover
          </p>
        </div>
        <GlassCard className="text-center py-16">
          <Trophy className="w-12 h-12 text-oslo-text-muted mx-auto mb-4" />
          <p className="text-oslo-text-secondary">Connect wallet to view your rank</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light">Weekly Ranks</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          7-tier progressive rank system with weekly bonuses
        </p>
      </div>

      {/* Week Timer + Current Rank */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-oslo-text-muted" />
            <span className="text-xs text-oslo-text-muted uppercase tracking-wider">
              Week Ends In
            </span>
          </div>
          <CountdownTimer
            targetTimestamp={weekEnd}
            className="text-2xl text-oslo-ice"
          />
          <p className="text-xs text-oslo-text-muted mt-2">
            Week #{currentWeekId.data?.toString() || "..."}
          </p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3">
            {rank > 0 ? (
              <RankBadge rank={rank} size="lg" />
            ) : (
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
                <span className="text-oslo-text-muted text-xs">--</span>
              </div>
            )}
            <div>
              <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
                Current Rank
              </p>
              <p className="text-xl font-light mt-0.5">
                {rank > 0 ? RANK_CONFIG[rank]?.label : "No Rank"}
              </p>
              {bonus != null && bonus > 0n && (
                <p className="text-sm text-oslo-ice mt-1">
                  ${formatToken(bonus, 2)} pending
                </p>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Claim Button */}
      {bonus != null && bonus > 0n && (
        <IceButton onClick={handleClaim} loading={isLoading} className="w-full">
          <Trophy className="w-4 h-4 mr-2" />
          Claim Rank Bonus
        </IceButton>
      )}

      {/* Protocol Bonus Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Bonus Pool"
          value={`$${poolBalance != null ? formatToken(poolBalance, 0) : "0"}`}
        />
        <StatCard
          label="Total Distributed"
          value={`$${totalDist != null ? formatToken(totalDist, 0) : "0"}`}
        />
        <StatCard
          label={`Your Turnover (W${weekId})`}
          value={`$${currentTurnover != null ? formatToken(currentTurnover as bigint, 0) : "0"}`}
        />
      </div>

      {/* Leg Breakdown (40/60 Ratio) */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Leg Breakdown</h2>
          {isQualified != null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isQualified
                  ? "text-oslo-success bg-oslo-success/10"
                  : "text-oslo-warning bg-oslo-warning/10"
              }`}
            >
              {isQualified ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Qualified
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Not Qualified
                </span>
              )}
            </span>
          )}
        </div>

        <p className="text-xs text-oslo-text-secondary mb-4">
          To qualify for rank bonuses, your largest leg must be &le;{RANK_MAIN_LEG_MAX_PCT}% of total team turnover, and other legs combined &ge;{RANK_OTHER_LEGS_MIN_PCT}%.
        </p>

        {directs.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <PieChart className="w-8 h-8 text-oslo-text-muted mx-auto mb-2" />
              <p className="text-sm text-oslo-text-secondary">No legs yet</p>
              <p className="text-xs text-oslo-text-muted mt-1">
                Invite referrals to build your team legs
              </p>
            </div>
            
            {/* Qualification Requirements */}
            <div className="p-4 rounded-lg bg-oslo-warning/5 border border-oslo-warning/20">
              <h3 className="text-xs font-medium text-oslo-warning mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" />
                Rank Qualification Requirements
              </h3>
              <div className="space-y-2 text-xs text-oslo-text-secondary">
                <div className="flex items-start gap-2">
                  <span className="text-oslo-error mt-0.5">✗</span>
                  <span><strong>Direct Referrals:</strong> You need at least 1 direct referral to qualify for rank bonuses</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-oslo-error mt-0.5">✗</span>
                  <span><strong>40/60 Leg Ratio:</strong> Your largest leg must be ≤{RANK_MAIN_LEG_MAX_PCT}% of total team turnover</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-oslo-success mt-0.5">✓</span>
                  <span><strong>Weekly Turnover:</strong> ${currentTurnover != null ? formatToken(currentTurnover as bigint, 0) : "0"} (meets minimum for rank consideration)</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {directs.slice(0, 8).map((legAddr) => (
              <LegRow
                key={legAddr}
                userAddress={address}
                legAddress={legAddr}
                weekId={weekId}
              />
            ))}
            {directs.length > 8 && (
              <p className="text-xs text-oslo-text-muted text-center">
                +{directs.length - 8} more legs
              </p>
            )}
            
            {/* Qualification Status */}
            {!isQualified && (
              <div className="mt-4 p-4 rounded-lg bg-oslo-warning/5 border border-oslo-warning/20">
                <h3 className="text-xs font-medium text-oslo-warning mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  Why You're Not Qualified
                </h3>
                <div className="space-y-2 text-xs text-oslo-text-secondary">
                  <div className="flex items-start gap-2">
                    <span className="text-oslo-success mt-0.5">✓</span>
                    <span><strong>Direct Referrals:</strong> {directs.length} leg(s) - Requirement met</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-oslo-error mt-0.5">✗</span>
                    <span><strong>40/60 Leg Ratio:</strong> Your largest leg exceeds {RANK_MAIN_LEG_MAX_PCT}% of total turnover. Build more balanced legs!</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-oslo-text-muted mt-0.5">ℹ</span>
                    <span><strong>Tip:</strong> Encourage referrals in your smaller legs to balance the ratio</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 40% threshold indicator */}
            <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-oslo-text-muted">Main Leg Cap</span>
                <span className="text-oslo-ice">{RANK_MAIN_LEG_MAX_PCT}% max</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-oslo-ice/50 rounded-full"
                  style={{ width: `${RANK_MAIN_LEG_MAX_PCT}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Rank Ladder */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-6">Rank Ladder</h2>
        <div className="space-y-3">
          {Object.entries(RANK_CONFIG)
            .reverse()
            .map(([r, config]) => {
              const rankNum = Number(r);
              const isCurrent = rank === rankNum;
              const isPast = rank > rankNum;
              const isFuture = rank < rankNum && rank > 0;

              return (
                <div
                  key={r}
                  className={`flex items-center gap-4 p-4 rounded-btn border transition-all ${
                    isCurrent
                      ? "border-oslo-ice/50 bg-oslo-ice-dim ice-glow-pulse"
                      : isPast
                      ? "border-oslo-success/30 bg-oslo-success/5"
                      : "border-white/5 bg-white/[0.02] opacity-60"
                  }`}
                >
                  <RankBadge rank={rankNum} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{config.label}</span>
                      {isCurrent && (
                        <span className="text-[10px] text-oslo-ice font-medium bg-oslo-ice/10 px-2 py-0.5 rounded-full">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-oslo-text-muted mt-0.5">
                      ${formatCompact(config.turnoverRequired)}+ weekly turnover
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-oslo-text-primary">
                      {config.bonusPct}%
                    </p>
                    <p className="text-[10px] text-oslo-text-muted">bonus</p>
                  </div>
                </div>
              );
            })}
        </div>
      </GlassCard>

      {/* Leaderboard */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Weekly Leaderboard</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-oslo-text-muted" />
            <input
              type="text"
              placeholder="Search address..."
              className="w-48 bg-oslo-void border border-white/10 rounded-btn pl-8 pr-3 py-1.5 text-xs text-oslo-text-primary placeholder:text-oslo-text-muted focus:outline-none focus:border-oslo-ice/50 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-oslo-text-muted uppercase tracking-wider border-b border-white/5">
                <th className="text-left py-3 px-3 w-12">#</th>
                <th className="text-left py-3 px-3">Address</th>
                <th className="text-right py-3 px-3 hidden sm:table-cell">Turnover</th>
                <th className="text-center py-3 px-3 hidden md:table-cell">Rank</th>
                <th className="text-right py-3 px-3">Est. Bonus</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5 text-center">
                <td colSpan={5} className="py-12">
                  <BarChart3 className="w-8 h-8 text-oslo-text-muted mx-auto mb-2" />
                  <p className="text-sm text-oslo-text-secondary">
                    Leaderboard data will populate from the subgraph index
                  </p>
                  <p className="text-xs text-oslo-text-muted mt-1">
                    Real-time rankings update every Monday 00:00 UTC
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Historical Performance */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-6">Historical Performance</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Weekly Turnover Chart */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <LineChart className="w-4 h-4 text-oslo-ice" />
              <h3 className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider">
                Weekly Turnover
              </h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart
                  data={[
                    { week: "W1", turnover: 0 },
                    { week: "W2", turnover: 0 },
                    { week: "W3", turnover: 0 },
                    { week: "W4", turnover: 0 },
                    { week: "W5", turnover: 0 },
                    { week: "W6", turnover: 0 },
                    { week: "W7", turnover: 0 },
                    { week: "W8", turnover: 0 },
                    { week: "W9", turnover: 0 },
                    { week: "W10", turnover: 0 },
                    { week: "W11", turnover: 0 },
                    { week: "W12", turnover: 0 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${formatCompact(v)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="turnover"
                    stroke="#00e5ff"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#00e5ff" }}
                  />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bonuses Claimed Chart */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-oslo-aurora" />
              <h3 className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider">
                Bonuses Claimed
              </h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { week: "W1", bonus: 0 },
                    { week: "W2", bonus: 0 },
                    { week: "W3", bonus: 0 },
                    { week: "W4", bonus: 0 },
                    { week: "W5", bonus: 0 },
                    { week: "W6", bonus: 0 },
                    { week: "W7", bonus: 0 },
                    { week: "W8", bonus: 0 },
                    { week: "W9", bonus: 0 },
                    { week: "W10", bonus: 0 },
                    { week: "W11", bonus: 0 },
                    { week: "W12", bonus: 0 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${formatCompact(v)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="bonus" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Cell key={i} fill="#7c3aed" fillOpacity={0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <p className="text-xs text-oslo-text-muted text-center mt-4">
          Charts populate from subgraph-indexed weekly data
        </p>
      </GlassCard>
    </div>
  );
}
