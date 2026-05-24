"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { parseEther, erc20Abi, type Address } from "viem";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { TierBadge } from "@/components/ui/TierBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { useInvestmentEngineReads, useDepositRead, useInvestmentEngineWrites } from "@/hooks/useInvestmentEngine";
import { useTokenReads } from "@/hooks/useToken";
import { useAppStore } from "@/store/useAppStore";
import { CONTRACTS } from "@/lib/contracts";
import osloDEXArtifact from "@/abis/OSLODEX.json";
const osloDEXAbi = osloDEXArtifact.abi;
import { formatToken, formatNumber } from "@/lib/utils";
import {
  TIER_BOUNDARIES,
  TIER_RATE_RANGES,
  RETURN_CAP_MULTIPLIER,
  WITHDRAWAL_FEE_PCT,
  MAX_DEPOSIT_PER_TX,
  getDailyRate,
  getTier as getTierFromAmt,
  formatRate,
  isLifetimeRateActive,
  LIFETIME_RATE_BP,
  LAUNCH_TIMESTAMP,
  LIFETIME_RATE_START,
  EARLY_EXIT_PERIOD_DAYS,
  EARLY_EXIT_FEE_PCT,
  EARLY_EXIT_PERIOD_SECONDS,
} from "@/lib/constants";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  Droplets,
  Wallet,
  Gift,
  Building2,
  BarChart3,
} from "lucide-react";

const TIER_COLORS: Record<number, string> = {
  1: "bg-slate-500/20 border-slate-500/50 text-slate-400",
  2: "bg-blue-500/20 border-blue-500/50 text-blue-400",
  3: "bg-cyan-500/20 border-cyan-500/50 text-cyan-400",
  4: "bg-purple-500/20 border-purple-500/50 text-purple-400",
  5: "bg-oslo-ice/20 border-oslo-ice/50 text-oslo-ice",
};

export default function InvestPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useAppStore();
  const publicClient = usePublicClient();
  const { totalActiveDeposit, userTier, depositCount, launchTimestamp, completedCycles, dAppBalance } =
    useInvestmentEngineReads(address);
  const { deposit, claimRewards, earlyExit, isLoading } =
    useInvestmentEngineWrites();

  const [amount, setAmount] = useState("");
  const [selectedDeposit, setSelectedDeposit] = useState(0);
  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "depositing">("idle");

  // ─── USDT Allowance Check ────────────────────────────────────────────
  const { data: usdtAllowance } = useReadContract({
    address: CONTRACTS.usdt,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.investmentEngine] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync: approveAsync } = useWriteContract();

  const tier = Number(userTier.data || 0);
  const depositNum = Number(depositCount.data || 0);
  const activeDepositWei = totalActiveDeposit.data as bigint | undefined;
  const activeDepositNum = activeDepositWei ? Number(activeDepositWei) / 1e18 : 0;
  const cycleCount = Number(completedCycles.data || 0);
  const amountNum = parseFloat(amount) || 0;
  const predictedTier = amountNum >= 10 ? getTier(amountNum) : 0;
  const effectiveRateBp = amountNum >= 10 ? getDailyRate(amountNum) : 0;
  const dailyRate = effectiveRateBp / 100;
  const lifetimeActive = isLifetimeRateActive();
  const dailyYield = amountNum * (dailyRate / 100);
  const threeXCap = amountNum * RETURN_CAP_MULTIPLIER;

  const handleDeposit = async () => {
    if (!amountNum || !address || !publicClient) return;

    const depositAmount = parseEther(amount);
    const currentAllowance = (usdtAllowance as bigint) || 0n;

    try {
      // ── Step 1: Approve USDT if needed ──────────────────────────
      if (currentAllowance < depositAmount) {
        setFlowStep("approving");
        addToast({ title: "Approving USDT...", status: "pending" });

        const approveTx = await approveAsync({
          address: CONTRACTS.usdt,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.investmentEngine, depositAmount],
        });

        addToast({
          title: "Approval Submitted",
          description: "Waiting for confirmation...",
          status: "pending",
          txHash: approveTx,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "USDT Approved", status: "success", txHash: approveTx });
      }

      // ── Step 2: Deposit ────────────────────────────────────────
      setFlowStep("depositing");
      addToast({
        title: "Depositing USDT...",
        description: `${amountNum} USDT → Tier ${predictedTier}`,
        status: "pending",
      });

      const tx = await deposit(depositAmount);

      addToast({
        title: "Deposit Submitted!",
        description: `${formatNumber(amountNum)} USDT at Tier ${predictedTier}`,
        status: "success",
        txHash: tx,
      });

      setAmount("");
      setFlowStep("idle");
    } catch (err: any) {
      setFlowStep("idle");
      addToast({
        title: "Transaction Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    }
  };

  const handleClaim = async (index: number) => {
    try {
      addToast({ title: "Claiming Rewards...", status: "pending" });
      const tx = await claimRewards(index);
      addToast({ title: "Rewards Claimed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Claim Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    }
  };

  const handleEarlyExit = async (index: number) => {
    try {
      addToast({ title: "Early Exit — Returning USDT...", status: "pending" });
      const tx = await earlyExit(index);
      addToast({ title: "Early Exit Complete — USDT Returned", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Early Exit Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Staking Engine</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          Deposit USDT and earn daily yields — {lifetimeActive ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}` : `${formatRate(effectiveRateBp)} daily`}
        </p>

      </div>

      {/* Protocol Reserve */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-oslo-success/10 border border-oslo-success/20">
            <Wallet className="w-5 h-5 text-oslo-success" />
          </div>
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">Contract Reserve</p>
            <p className="text-xl font-mono font-light text-oslo-text-primary">
              11,000,000 OSLO
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Held in InvestmentEngine for rewards</p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-oslo-ice/10 border border-oslo-ice/20">
            <BarChart3 className="w-5 h-5 text-oslo-ice" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">Fund Allocation</p>
            <p className="text-sm font-light text-oslo-text-primary">
              98% Liquidity · 1% Rewards · 0.5% Company · 0.5% Growth
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Applied on every deposit, re-investment, and re-stake</p>
          </div>
        </div>
      </div>

      {/* Deposit Panel + Tier Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit Form */}
        <GlassCard>
          <h2 className="text-lg font-medium mb-4">Deposit USDT</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider">
                Amount (USDT)
              </label>
              <div className="mt-1.5 relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="10"
                  max={MAX_DEPOSIT_PER_TX}
                  step="1"
                  className="w-full bg-oslo-void border border-white/10 rounded-btn px-4 py-3 text-lg font-mono text-oslo-text-primary placeholder:text-oslo-text-muted focus:outline-none focus:border-oslo-ice/50 focus:shadow-[0_0_12px_rgba(0,229,255,0.1)] transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-oslo-text-muted font-medium">
                  USDT
                </span>
              </div>
              <p className="text-[10px] text-oslo-text-muted mt-1">
                Min $10 — Max ${MAX_DEPOSIT_PER_TX.toLocaleString()} per transaction. Multiple deposits allowed.
              </p>
            </div>

            {amountNum >= 10 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-white/[0.03] border border-white/5 space-y-2"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Deposit Amount</span>
                  <span className="font-mono text-oslo-text-primary">{formatNumber(amountNum)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">To Liquidity Pool (98%)</span>
                  <span className="font-mono text-oslo-ice">{formatNumber(amountNum * 0.98)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">To Reward Wallet (1%)</span>
                  <span className="font-mono text-oslo-success">{formatNumber(amountNum * 0.01)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Company Support (0.5%)</span>
                  <span className="font-mono text-oslo-text-muted">{formatNumber(amountNum * 0.005)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Better Performance (0.5%)</span>
                  <span className="font-mono text-oslo-text-muted">{formatNumber(amountNum * 0.005)} USDT</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                  <span className="text-oslo-text-muted">Tier</span>
                  <TierBadge tier={predictedTier} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Daily Yield</span>
                  <span className="font-mono text-oslo-ice">${formatNumber(dailyYield)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Daily Rate</span>
                  <span className="font-mono text-oslo-ice">{formatRate(effectiveRateBp)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Claim Fee</span>
                  <span className="font-mono text-oslo-text-muted">{WITHDRAWAL_FEE_PCT}%</span>
                </div>
              </motion.div>
            )}

            {/* Approval status indicator */}
            {amountNum >= 10 && (
              <div className="flex items-center gap-2 text-xs">
                {(() => {
                  const depositAmount = parseEther(amount);
                  const allowance = (usdtAllowance as bigint) || 0n;
                  if (allowance >= depositAmount) {
                    return (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-oslo-success" />
                        <span className="text-oslo-success">USDT approved — ready to deposit</span>
                      </>
                    );
                  }
                  return (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-oslo-warning" />
                      <span className="text-oslo-warning">Approval required — one-click sign below</span>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Over-max warning */}
            {amountNum > MAX_DEPOSIT_PER_TX && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-oslo-danger/5 border border-oslo-danger/10">
                <AlertTriangle className="w-3.5 h-3.5 text-oslo-danger" />
                <span className="text-oslo-danger">Max ${MAX_DEPOSIT_PER_TX.toLocaleString()} per transaction. Split into multiple deposits of $5,000 each.</span>
              </div>
            )}

            <IceButton
              onClick={handleDeposit}
              disabled={
                !isConnected ||
                !amountNum ||
                amountNum < 10 ||
                amountNum > MAX_DEPOSIT_PER_TX ||
                flowStep !== "idle"
              }
              loading={flowStep !== "idle"}
              className="w-full"
            >
              {(() => {
                if (!isConnected) return "Connect Wallet";
                if (flowStep === "approving") return "Approving USDT...";
                if (flowStep === "depositing") return "Depositing...";
                if (!amountNum || amountNum < 10) return "Enter Amount";
                if (amountNum > MAX_DEPOSIT_PER_TX) return `Max $${MAX_DEPOSIT_PER_TX.toLocaleString()}`;
                const allowance = (usdtAllowance as bigint) || 0n;
                if (allowance < parseEther(amount)) return "Approve & Deposit";
                return "Deposit USDT";
              })()}
            </IceButton>
          </div>
        </GlassCard>

        {/* Tier Visualizer */}
        <GlassCard>
          <h2 className="text-lg font-medium mb-4">Tier Calculator</h2>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((t) => {
              const boundary = TIER_BOUNDARIES[t as keyof typeof TIER_BOUNDARIES];
              const range = TIER_RATE_RANGES[t];
              const isActive = predictedTier === t && amountNum >= 10;
              const isUserTier = tier === t;
              return (
                <div
                  key={t}
                  className={`flex items-center gap-4 p-3 rounded-btn border transition-all ${
                    isActive
                      ? "border-oslo-ice/50 bg-oslo-ice-dim shadow-[0_0_12px_rgba(0,229,255,0.08)]"
                      : isUserTier
                      ? "border-oslo-aurora/40 bg-oslo-aurora-dim"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <TierBadge tier={t} />
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      ${boundary.min.toLocaleString()}+
                    </p>
                    <p className="text-[10px] text-oslo-text-muted mt-0.5">
                      {lifetimeActive
                        ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}`
                        : `${(range.min / 100).toFixed(2)}% – ${(range.max / 100).toFixed(2)}% daily`
                      }
                    </p>
                  </div>
                  {isActive && (
                    <span className="text-[10px] text-oslo-ice font-medium">ACTIVE</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3X Cap Info */}
          {amountNum >= 10 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 p-4 rounded-lg bg-white/[0.03] border border-white/5"
            >
              <h3 className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider mb-3">
                3X Return Cap
              </h3>
              <div className="flex items-center gap-3">
                <ProgressRing progress={0} size={48} color="ice" showLabel={false} />
                <div>
                  <p className="text-sm font-mono text-oslo-text-primary">
                    Up to {formatNumber(threeXCap)} USDT
                  </p>
                  <p className="text-xs text-oslo-text-muted mt-0.5">
                    {RETURN_CAP_MULTIPLIER}X of your {formatNumber(amountNum)} USDT deposit
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </GlassCard>
      </div>

      {/* Portfolio Cards */}
      {isConnected && depositNum > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-4">Your Portfolio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: Math.min(depositNum, 6) }).map((_, i) => (
              <DepositCard
                key={i}
                index={i}
                onClaim={handleClaim}
                onEarlyExit={handleEarlyExit}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deposit Card Component ──────────────────────────────────────────────

function DepositCard({
  index,
  onClaim,
  onEarlyExit,
}: {
  index: number;
  onClaim: (i: number) => void;
  onEarlyExit: (i: number) => void;
}) {
  const { address } = useAccount();
  const { addToast } = useAppStore();
  const { writeContractAsync } = useWriteContract();
  const { depositData, pendingRewards, isInEarlyExit, earlyExitAmount } = useDepositRead(
    address,
    index
  );
  const { osloBalance } = useTokenReads(address);

  const deposit = depositData.data as [bigint, bigint, bigint, bigint, bigint, boolean] | undefined;
  const rewards = pendingRewards.data as [bigint, bigint] | undefined;

  const [convertingOslo, setConvertingOslo] = useState(false);
  const [earlyExiting, setEarlyExiting] = useState(false);

  if (!deposit) return <Skeleton className="h-64" />;

  const [amount, tier, depositTime, lastClaimTime, totalClaimed, active] = deposit;
  const amountNum = Number(amount) / 1e18;
  const tierNum = Number(tier);
  const claimedNum = Number(totalClaimed) / 1e18;
  const capProgress = (claimedNum / (amountNum * RETURN_CAP_MULTIPLIER)) * 100;
  const invReturn = rewards ? Number(rewards[0]) / 1e18 : 0;
  const profReturn = rewards ? Number(rewards[1]) / 1e18 : 0;
  const osloBal = osloBalance?.data as bigint | undefined;
  const osloBalNum = osloBal ? Number(osloBal) / 1e18 : 0;

  // Early exit data
  const inEarlyExit = (isInEarlyExit?.data as boolean) || false;
  const exitData = earlyExitAmount?.data as [bigint, bigint, bigint, bigint] | undefined;
  const exitPrincipal = exitData ? Number(exitData[0]) / 1e18 : 0;
  const exitAccruedYield = exitData ? Number(exitData[1]) / 1e18 : 0;
  const exitFee = exitData ? Number(exitData[2]) / 1e18 : 0;
  const exitNetReturn = exitData ? Number(exitData[3]) / 1e18 : 0;
  const depositTimestamp = Number(depositTime);
  const exitDeadline = depositTimestamp + EARLY_EXIT_PERIOD_SECONDS;
  const exitDaysLeft = Math.max(0, Math.ceil((exitDeadline - Date.now() / 1000) / 86400));
  const exitHoursLeft = Math.max(0, Math.ceil((exitDeadline - Date.now() / 1000) / 3600));

  const handleConvertOsloToUSDT = async () => {
    if (!osloBal || osloBal === 0n) return;
    setConvertingOslo(true);
    try {
      addToast({ title: "Converting OSLO to USDT...", status: "pending" });
      const tx = await writeContractAsync({
        address: CONTRACTS.osloDEX,
        abi: osloDEXAbi,
        functionName: "swapOSLOForUSDT",
        args: [osloBal, 0n],
      });
      addToast({ title: "Converted to USDT!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Conversion Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    } finally {
      setConvertingOslo(false);
    }
  };

  return (
    <GlassCard className="p-5 relative overflow-hidden">

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <TierBadge tier={tierNum} />
        </div>
        {!active && (
          <span className="text-[10px] text-oslo-danger font-medium px-2 py-0.5 rounded-full bg-oslo-danger-dim border border-oslo-danger/30">
            Capped
          </span>
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs text-oslo-text-muted uppercase tracking-wider">Principal</p>
        <p className="text-xl font-mono font-light text-oslo-text-primary">
          ${formatNumber(amountNum)}
        </p>
      </div>

      {/* Accrued */}
      <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-white/[0.03]">
        <div>
          <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
            Investment Return
          </p>
          <p className="text-sm font-mono text-oslo-text-primary">
            ${formatNumber(invReturn, 4)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
            Profit Return
          </p>
          <p className="text-sm font-mono text-oslo-text-primary">
            ${formatNumber(profReturn, 4)}
          </p>
        </div>
      </div>

      {/* OSLO Balance (from yield claims) */}
      {osloBalNum > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-oslo-ice/5 border border-oslo-ice/10">
          <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
            OSLO Balance
          </p>
          <p className="text-sm font-mono text-oslo-ice">
            {formatNumber(osloBalNum)} OSLO
          </p>
        </div>
      )}

      {/* 3X Cap Progress */}
      <div className="flex items-center gap-3 mb-4">
        <ProgressRing
          progress={Math.min(capProgress, 100)}
          size={40}
          strokeWidth={3}
          color={capProgress >= 75 ? "warning" : "ice"}
        />
        <div className="text-xs">
          <p className="text-oslo-text-muted">3X Cap</p>
          <p className="font-mono text-oslo-text-primary">
            {formatNumber(claimedNum)} / {formatNumber(amountNum * RETURN_CAP_MULTIPLIER)}
          </p>
        </div>
      </div>

      {/* V3: Early Exit — 10-day window with 10% fee + yield deduction, paid in USDT */}
      {active && inEarlyExit && exitNetReturn > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-oslo-aurora/5 border border-oslo-aurora/10 space-y-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-oslo-aurora" />
            <span className="text-[10px] text-oslo-aurora font-medium">
              Early Exit Available — {exitDaysLeft > 0 ? `${exitDaysLeft}d remaining` : `${exitHoursLeft}h remaining`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <span className="text-oslo-text-muted">Principal</span>
            <span className="font-mono text-oslo-text-primary text-right">${formatNumber(exitPrincipal)}</span>
            <span className="text-oslo-text-muted">Accrued Yield</span>
            <span className="font-mono text-oslo-success text-right">-${formatNumber(exitAccruedYield, 4)}</span>
            <span className="text-oslo-text-muted">{EARLY_EXIT_FEE_PCT}% Exit Fee</span>
            <span className="font-mono text-oslo-danger text-right">-${formatNumber(exitFee)}</span>
            <span className="text-oslo-text-muted pt-1 border-t border-white/5">You Receive (USDT)</span>
            <span className="font-mono text-oslo-ice text-right pt-1 border-t border-white/5">${formatNumber(exitNetReturn)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {active && (
        <div className="flex gap-2">
          <IceButton
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => onClaim(index)}
            disabled={invReturn + profReturn <= 0}
          >
            Claim OSLO
          </IceButton>
        </div>
      )}
      {/* Convert OSLO to USDT */}
      {osloBalNum > 0 && (
        <IceButton
          size="sm"
          variant="primary"
          className="w-full mt-2"
          onClick={handleConvertOsloToUSDT}
          loading={convertingOslo}
          disabled={convertingOslo}
        >
          Convert {formatNumber(osloBalNum)} OSLO → USDT
        </IceButton>
      )}
      {/* Early Exit button — within 10-day window, returns USDT */}
      {active && inEarlyExit && exitNetReturn > 0 && (
        <IceButton
          size="sm"
          variant="primary"
          className="w-full mt-2 bg-oslo-aurora hover:bg-oslo-aurora/80"
          onClick={() => {
            setEarlyExiting(true);
            onEarlyExit(index);
          }}
          loading={earlyExiting}
          disabled={earlyExiting}
        >
          Early Exit — Get ${formatNumber(exitNetReturn)} USDT
        </IceButton>
      )}
    </GlassCard>
  );
}

// ─── Tier Helper ─────────────────────────────────────────────────────────

function getTier(amount: number): number {
  if (amount >= 5000) return 4;
  if (amount >= 2500) return 3;
  if (amount >= 500) return 2;
  if (amount >= 10) return 1;
  return 0;
}
