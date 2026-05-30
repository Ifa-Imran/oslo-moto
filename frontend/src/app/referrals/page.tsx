"use client";

import { useAccount } from "wagmi";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useReferralReads, useReferralWrites } from "@/hooks/useReferral";
import { useRankSystemReads, useWeeklyTurnover, useLegTurnover } from "@/hooks/useRankSystem";
import { useAppStore } from "@/store/useAppStore";
import { formatToken, formatNumber, formatCompact, truncateAddress, copyToClipboard } from "@/lib/utils";
import {
  MAX_REFERRAL_LEVELS,
  LEVEL_UNLOCK_THRESHOLDS,
  REFERRAL_COMMISSION_RATES,
} from "@/lib/constants";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  Users,
  Copy,
  Share2,
  ChevronRight,
  Gift,
  ArrowRight,
  ChevronDown,
  Search,
  Network,
  Plus,
  Minus,
  TrendingUp,
  Info,
} from "lucide-react";

// ─── Level Income Row Component ──────────────────────────────────────

function LevelIncomeRow({
  level,
  isUnlocked,
  ratePct,
  earned,
  legAddr,
  weekId,
  userAddress,
}: {
  level: number;
  isUnlocked: boolean;
  ratePct: number;
  earned: number;
  legAddr?: string;
  weekId: number;
  userAddress?: string;
}) {
  // Read leg turnover from RankSystem for Level 1 (business volume)
  const { data: legTurnoverData } = useLegTurnover(
    userAddress as `0x${string}` | undefined,
    weekId,
    legAddr as `0x${string}` | undefined
  );
  const legVolume = legTurnoverData ? Number(legTurnoverData as bigint) / 1e18 : 0;

  const threshold = LEVEL_UNLOCK_THRESHOLDS.find(t => level <= t.maxLevel);

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center p-3 rounded-lg border transition-all ${
        isUnlocked
          ? 'bg-white/[0.03] border-white/10'
          : 'bg-white/[0.01] border-white/5 opacity-50'
      }`}
    >
      {/* Level badge */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          isUnlocked
            ? 'bg-oslo-ice/20 text-oslo-ice'
            : 'bg-white/5 text-oslo-text-muted'
        }`}
      >
        L{level}
      </div>

      {/* Commission rate + status */}
      <div>
        <p className={`text-sm ${isUnlocked ? 'text-oslo-text-primary' : 'text-oslo-text-muted'}`}>
          {ratePct}% commission
        </p>
        <p className="text-[10px] text-oslo-text-muted">
          {isUnlocked
            ? 'Unlocked'
            : `Requires ${threshold?.required || 0} qualified directs`}
        </p>
      </div>

      {/* Income earned */}
      <div className="text-right">
        <p className={`text-sm font-mono ${earned > 0 ? 'text-oslo-success' : 'text-oslo-text-muted'}`}>
          ${formatNumber(earned, 2)}
        </p>
        <p className="text-[10px] text-oslo-text-muted">earned</p>
      </div>

      {/* Business volume (leg turnover) */}
      <div className="text-right hidden sm:block">
        {legAddr && isUnlocked && legVolume > 0 ? (
          <>
            <p className="text-sm font-mono text-oslo-text-secondary">
              ${formatCompact(legVolume)}
            </p>
            <p className="text-[10px] text-oslo-text-muted">volume</p>
          </>
        ) : (
          <p className="text-[10px] text-oslo-text-muted">
            {isUnlocked ? '—' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ReferralsPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useAppStore();
  const {
    isRegistered,
    referrer,
    directReferrals,
    qualifiedDirects,
    unlockedLevels,
    teamSize,
    referralRewards,
    totalRegistered,
    totalCommissionsPaid,
    userInfoData,
    allLevelIncome,
  } = useReferralReads(address);
  const { claimReferralRewards, isLoading } = useReferralWrites();

  // Rank system for business volume per leg
  const { currentWeekId } = useRankSystemReads(address);
  const weekId = Number(currentWeekId.data || 0);

  const directs = (directReferrals.data as string[]) || [];
  const qualified = Number(qualifiedDirects.data || 0);
  const levels = Number(unlockedLevels.data || 0);
  const team = Number(teamSize.data || 0);
  const rewards = referralRewards.data as bigint | undefined;
  const totalReg = Number((totalRegistered.data as bigint) || 0n);
  const totalComm = totalCommissionsPaid.data as bigint | undefined;
  // userInfo returns [referrer, unlockedLevels, totalEarned, registered]
  const userInfoArr = userInfoData.data as [string, bigint, bigint, boolean] | undefined;
  const totalEarned = userInfoArr?.[2];
  const unlockedLvls = Number(userInfoArr?.[1] || 0);

  // Per-level income array: index 0=total, 1-20 = per-level (USDT units)
  const levelIncomeArr = allLevelIncome?.data as bigint[] | undefined;

  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${address}`
    : "";

  const copyReferralLink = async () => {
    if (!referralLink) return;
    const success = await copyToClipboard(referralLink);
    addToast({
      title: success ? "Referral link copied!" : "Copy failed — tap and hold to copy manually",
      status: success ? "success" : "error",
    });
  };

  const handleClaim = async () => {
    try {
      addToast({ title: "Claiming Referral Rewards...", status: "pending" });
      const tx = await claimReferralRewards();
      addToast({ title: "Rewards Claimed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Claim Failed",
        description: err?.message?.slice(0, 100),
        status: "error",
      });
    }
  };

  // Determine next level unlock requirement
  const nextUnlock = LEVEL_UNLOCK_THRESHOLDS.find((t) => levels < t.maxLevel);

  if (!isConnected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-light">Referral Network</h1>
          <p className="mt-1 text-sm text-oslo-text-secondary">
            Connect your wallet to view your referral network
          </p>
        </div>
        <GlassCard className="text-center py-16">
          <Users className="w-12 h-12 text-oslo-text-muted mx-auto mb-4" />
          <p className="text-oslo-text-secondary">Connect wallet to get started</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light">Referral Network</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          Build your team across 20 levels and earn commissions
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Direct Referrals" value={directs.length.toString()} mono={false} />
        <StatCard label="Qualified Directs" value={qualified.toString()} mono={false} />
        <StatCard
          label="Unlocked Levels"
          value={`${levels} / ${MAX_REFERRAL_LEVELS}`}
          mono={false}
        />
        <StatCard label="Team Size" value={team.toString()} mono={false} />
        <StatCard label="Total Registered" value={totalReg.toLocaleString()} mono={false} />
        <StatCard
          label="My Total Earned"
          value={`$${totalEarned != null ? formatToken(totalEarned, 2) : "0.00"}`}
          mono
        />
      </div>

      {/* Referral Link */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 w-full">
            <p className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider mb-1">
              Your Referral Link
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-oslo-text-secondary bg-oslo-void px-3 py-2 rounded-btn border border-white/10 truncate">
                {referralLink}
              </code>
              <IceButton size="sm" variant="secondary" onClick={copyReferralLink}>
                <Copy className="w-3 h-3" />
              </IceButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Level Unlock Progress */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-4">Level Unlock Progress</h2>
        <div className="flex gap-1">
          {[3, 8, 12, 16, 20].map((maxLevel, i) => {
            const threshold = LEVEL_UNLOCK_THRESHOLDS[i];
            const unlocked = levels >= maxLevel;
            return (
              <div key={maxLevel} className="flex-1">
                <div
                  className={`h-2 rounded-full transition-all ${
                    unlocked
                      ? "bg-oslo-ice"
                      : qualified >= threshold.required
                      ? "bg-oslo-ice/30"
                      : "bg-white/10"
                  }`}
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-oslo-text-muted">
                    Lv{maxLevel}
                  </span>
                  <span className="text-[10px] text-oslo-text-muted">
                    {threshold.required} dir
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {nextUnlock && (
          <p className="text-xs text-oslo-text-secondary mt-3">
            Need {nextUnlock.required - qualified} more qualified direct(s) to unlock levels{" "}
            {levels + 1}–{nextUnlock.maxLevel}
          </p>
        )}
      </GlassCard>

      {/* Commission Breakdown + Rewards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commission Rates */}
        <GlassCard>
          <h2 className="text-sm font-medium mb-4">Commission Breakdown</h2>
          <div className="space-y-2">
            {Object.entries(REFERRAL_COMMISSION_RATES).map(([key, rate]) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
              >
                <span className="text-sm text-oslo-text-secondary">
                  {key.length <= 2 ? `Level ${key}` : `Levels ${key}`}
                </span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-oslo-ice rounded-full"
                      style={{ width: `${Math.min(rate.pct * 3.33, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono text-oslo-text-primary w-12 text-right">
                    {rate.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Rewards Panel */}
        <GlassCard>
          <h2 className="text-sm font-medium mb-4">Referral Rewards</h2>
          <div className="mb-4">
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              Claimable Rewards
            </p>
            <p className="text-3xl font-mono font-light text-oslo-ice mt-1">
              ${rewards != null ? formatToken(rewards, 2) : "0.00"}
            </p>
            {totalEarned != null && totalEarned > 0n && (
              <p className="text-xs text-oslo-text-muted mt-1">
                Lifetime earned: ${formatToken(totalEarned, 2)}
              </p>
            )}
          </div>
          <IceButton
            onClick={handleClaim}
            disabled={!rewards || rewards < BigInt("1000000000000000000") || isLoading}
            loading={isLoading}
            className="w-full"
          >
            <Gift className="w-4 h-4 mr-2" />
            Claim All Rewards
          </IceButton>
          {rewards != null && rewards > 0n && rewards < BigInt("1000000000000000000") && (
            <p className="text-[10px] text-oslo-text-muted text-center mt-2">
              Minimum $1.00 required to claim
            </p>
          )}
        </GlassCard>
      </div>

      {/* Level Income Breakdown */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-oslo-ice" />
            Level Commission (Yield-on-Yield)
          </h2>
          <div className="flex items-center gap-1 text-xs text-oslo-text-muted">
            <Info className="w-3 h-3" />
            <span>Earned when downline claims yield</span>
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center mb-2 px-3">
          <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Lv</span>
          <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Commission</span>
          <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider text-right">Income</span>
          <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider text-right hidden sm:block">Volume</span>
        </div>

        <div className="space-y-2">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => {
            const isUnlocked = level <= unlockedLvls;
            const rateEntry = Object.entries(REFERRAL_COMMISSION_RATES).find(([key]) => {
              if (key === '1') return level === 1;
              if (key === '2') return level === 2;
              if (key === '3-10') return level >= 3 && level <= 10;
              if (key === '11-15') return level >= 11 && level <= 15;
              if (key === '16-20') return level >= 16 && level <= 20;
              return false;
            });
            const rate = rateEntry ? rateEntry[1] : { pct: 0 };
            // Per-level income from contract (USDT units, 18 decimals)
            const levelEarned = levelIncomeArr?.[level] || 0n;
            const earnedNum = Number(levelEarned) / 1e18;
            // Business volume: sum across direct legs for Level 1 only (others from subgraph later)
            const isLevel1 = level === 1;
            const legAddr = isLevel1 ? directs[0] : undefined;

            return (
              <LevelIncomeRow
                key={level}
                level={level}
                isUnlocked={isUnlocked}
                ratePct={rate.pct}
                earned={earnedNum}
                legAddr={legAddr}
                weekId={weekId}
                userAddress={address}
              />
            );
          })}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-oslo-ice/5 border border-oslo-ice/10">
          <p className="text-xs text-oslo-text-secondary">
            <strong className="text-oslo-ice">How Yield-on-Yield Works:</strong>
            <br />
            • When your downline claims their daily yield, you automatically earn a level commission
            <br />
            • This is called &quot;yield-on-yield&quot; — you earn from your team&apos;s profit claims
            <br />
            • Commission rates: L1 = 30%, L2 = 20%, L3-10 = 1%, L11-15 = 0.5%, L16-20 = 0.25%
            <br />
            • Higher levels require more qualified direct referrals to unlock
            <br />
            • Qualified = Direct referral with $10+ USDT active deposit
            <br />
            • Commissions are paid in OSLO (equivalent to USDT value at current DEX rate)
          </p>
        </div>
      </GlassCard>

      {/* Direct Referrals List + Tree */}
      {directs.length > 0 && (
        <>
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">
                Referral Tree ({directs.length} directs)
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-oslo-text-muted" />
                  <input
                    type="text"
                    placeholder="Search address..."
                    className="w-40 bg-oslo-void border border-white/10 rounded-btn pl-8 pr-3 py-1.5 text-xs text-oslo-text-primary placeholder:text-oslo-text-muted focus:outline-none focus:border-oslo-ice/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Tree Visualization */}
            <div className="relative overflow-x-auto pb-4">
              <div className="min-w-[600px]">
                {/* Root (You) */}
                <div className="flex justify-center mb-8">
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-oslo-ice/10 border-2 border-oslo-ice/50 flex items-center justify-center mb-2 shadow-[0_0_16px_rgba(0,229,255,0.15)]">
                      <span className="text-lg font-bold text-oslo-ice">YOU</span>
                    </div>
                    <span className="text-[10px] text-oslo-text-muted">
                      {address ? truncateAddress(address, 6) : "..."}
                    </span>
                  </div>
                </div>

                {/* Connecting line root → L1 */}
                <div className="flex justify-center mb-4">
                  <div className="w-px h-6 bg-oslo-ice/30" />
                </div>

                {/* Level 1 (Directs) */}
                <div className="flex justify-center mb-6">
                  <div className="w-3/4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-oslo-ice/20" />
                      <span className="text-[10px] text-oslo-ice font-medium px-2">Level 1</span>
                      <div className="h-px flex-1 bg-oslo-ice/20" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {directs.slice(0, 9).map((addr, i) => (
                        <motion.div
                          key={addr}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex flex-col items-center p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:border-oslo-ice/20 transition-all"
                        >
                          {/* Node dot + connecting line */}
                          <div className="w-3 h-3 rounded-full bg-oslo-ice/40 mb-2" />
                          <AddressChip address={addr} />
                          <span className="text-[10px] text-oslo-text-muted mt-1">
                            Direct #{i + 1}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                    {directs.length > 9 && (
                      <p className="text-xs text-oslo-text-muted text-center mt-3">
                        +{directs.length - 9} more directs — expand to view deeper levels
                      </p>
                    )}
                  </div>
                </div>

                {/* Level 2+ placeholder */}
                <div className="flex justify-center">
                  <div className="text-center p-6 rounded-lg bg-white/[0.02] border border-dashed border-white/10 w-3/4">
                    <Network className="w-6 h-6 text-oslo-text-muted mx-auto mb-2" />
                    <p className="text-xs text-oslo-text-secondary">
                      Deeper levels (L2–L{MAX_REFERRAL_LEVELS}) will render when
                      downline data is available from the subgraph
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
