"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { parseEther, erc20Abi, maxUint256, type Address } from "viem";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { TierBadge } from "@/components/ui/TierBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { useInvestmentEngineReads, useDepositRead, useInvestmentEngineWrites } from "@/hooks/useInvestmentEngine";
import { useTokenReads, useUSDTReads } from "@/hooks/useToken";
import { useAppStore } from "@/store/useAppStore";
import { CONTRACTS } from "@/lib/contracts";
import osloDEXAbi from "@/abis/OSLODEX.json";
import { formatToken, formatNumber } from "@/lib/utils";
import {
  PKG1_MIN,
  PKG2_MIN,
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
  YIELD_SCHEDULE,
  DAY_NAMES,
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
  const { deposit, claimRewards, earlyExit, partialEarlyExit, isLoading } =
    useInvestmentEngineWrites();
  const { usdtBalance } = useUSDTReads(address);
  const userUsdtBalance = usdtBalance?.data as bigint | undefined;
  const userUsdtNum = userUsdtBalance ? Number(userUsdtBalance) / 1e18 : 0;

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
      // ── Step 1: Approve USDT if needed (MaxUint256 = one-time infinite approval) ──
      if (currentAllowance < depositAmount) {
        setFlowStep("approving");
        addToast({ title: "Approving USDT...", status: "pending" });

        const approveTx = await approveAsync({
          address: CONTRACTS.usdt,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.investmentEngine, maxUint256],
        });

        addToast({
          title: "Approval Submitted",
          description: "Waiting for confirmation...",
          status: "pending",
          txHash: approveTx,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        // Wait for RPC node propagation to prevent simulation failure
        await new Promise(resolve => setTimeout(resolve, 3000));
        addToast({ title: "USDT Approved", status: "success", txHash: approveTx });
      }

      // ── Step 2: Deposit ────────────────────────────────────────
      setFlowStep("depositing");
      addToast({
        title: "Depositing USDT...",
        description: `${amountNum} USDT → Package ${predictedTier}`,
        status: "pending",
      });

      const tx = await deposit(depositAmount);

      addToast({
        title: "Deposit Submitted!",
        description: `${formatNumber(amountNum)} USDT at Package ${predictedTier}`,
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

  const handleEarlyExit = async (index: number, percentageBp: number = 10000) => {
    try {
      addToast({ title: `Early Exit ${percentageBp / 100}% — Returning USDT...`, status: "pending" });
      const tx = await partialEarlyExit(index, percentageBp);
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
          Deposit USDT and earn daily OSLO yields — paid exclusively in OSLO tokens — {lifetimeActive ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}` : `${formatRate(effectiveRateBp)} daily`}
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

            {/* USDT Balance display */}
            {isConnected && userUsdtBalance !== undefined && (
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-oslo-text-muted">Your USDT Balance</span>
                <span className={`font-mono ${amountNum > 0 && amountNum > userUsdtNum ? 'text-oslo-danger' : 'text-oslo-text-primary'}`}>
                  ${formatNumber(userUsdtNum)} USDT
                </span>
              </div>
            )}

            {/* Insufficient balance warning */}
            {amountNum > 0 && amountNum > userUsdtNum && userUsdtBalance !== undefined && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-oslo-danger/5 border border-oslo-danger/10">
                <AlertTriangle className="w-3.5 h-3.5 text-oslo-danger" />
                <span className="text-oslo-danger">Insufficient USDT balance. You need ${formatNumber(amountNum - userUsdtNum)} more USDT.</span>
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
                (userUsdtBalance !== undefined && amountNum > userUsdtNum) ||
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
                if (userUsdtBalance !== undefined && amountNum > userUsdtNum) return "Insufficient USDT";
                const allowance = (usdtAllowance as bigint) || 0n;
                if (allowance < parseEther(amount)) return "Approve & Deposit";
                return "Deposit USDT";
              })()}
            </IceButton>
          </div>
        </GlassCard>

        {/* Package Visualizer */}
        <GlassCard>
          <h2 className="text-lg font-medium mb-4">Package Calculator</h2>
          <div className="space-y-3">
            {[1, 2].map((pkg) => {
              const schedule = YIELD_SCHEDULE[pkg];
              const isActive = predictedTier === pkg && amountNum >= 10;
              const isUserTier = tier === pkg;
              return (
                <div
                  key={pkg}
                  className={`flex items-center gap-4 p-3 rounded-btn border transition-all ${
                    isActive
                      ? "border-oslo-ice/50 bg-oslo-ice-dim shadow-[0_0_12px_rgba(0,229,255,0.08)]"
                      : isUserTier
                      ? "border-oslo-aurora/40 bg-oslo-aurora-dim"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <TierBadge tier={pkg} />
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      {schedule.range}
                    </p>
                    <p className="text-[10px] text-oslo-text-muted mt-0.5">
                      {lifetimeActive
                        ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}`
                        : `${schedule.weeklyTotal}% weekly (dynamic daily)`
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
          {/* Aggregated Portfolio Summary */}
          <GlassCard className="mb-4">
            <h2 className="text-lg font-medium mb-3">Portfolio Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Total Invested</p>
                <p className="text-lg font-mono text-oslo-text-primary">${formatNumber(activeDepositNum)}</p>
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Active Deposits</p>
                <p className="text-lg font-mono text-oslo-text-primary">{depositNum}</p>
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Current Tier</p>
                <TierBadge tier={tier} />
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">3X Cap Limit</p>
                <p className="text-lg font-mono text-oslo-text-primary">${formatNumber(activeDepositNum * RETURN_CAP_MULTIPLIER)}</p>
              </div>
            </div>

            {/* 3X Cap Alert */}
            {cycleCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-3 rounded-lg bg-oslo-warning/10 border border-oslo-warning/30 flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-oslo-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-oslo-warning">3X Earnings Cap Reached!</p>
                  <p className="text-xs text-oslo-text-muted mt-1">
                    Your earnings have reached the 3X limit. To continue earning, please <span className="text-oslo-ice font-medium">reinvest your package</span>.
                  </p>
                </div>
              </motion.div>
            )}
          </GlassCard>

          {/* Dynamic Yield Schedule */}
          <GlassCard className="mb-4">
            <h2 className="text-lg font-medium mb-1">Dynamic Yield Schedule</h2>
            <p className="text-xs text-oslo-text-muted mb-4">
              Yield earnings are generated daily according to your package.
            </p>
            <div className="space-y-4">
              {Object.entries(YIELD_SCHEDULE).map(([tierKey, schedule]) => (
                <div key={tierKey} className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={Number(tierKey)} />
                      <span className="text-xs text-oslo-text-muted">{schedule.range}</span>
                    </div>
                    <span className="text-xs font-mono text-oslo-ice">{schedule.weeklyTotal}% / week</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {DAY_NAMES.map((day, i) => (
                      <div key={day} className="text-center">
                        <p className="text-[9px] text-oslo-text-muted uppercase">{day}</p>
                        <p className={`text-xs font-mono mt-0.5 ${
                          schedule.days[i] >= 1.0 ? "text-oslo-ice" : "text-oslo-text-primary"
                        }`}>
                          {schedule.days[i].toFixed(2)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {lifetimeActive && (
              <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-400 font-medium">
                  Lifetime rate active: 0.45% daily for all new deposits
                </p>
              </div>
            )}
            <p className="text-[10px] text-oslo-text-muted mt-3 italic">
              After 3X earnings, reinvestment will follow the same yield process.
            </p>
          </GlassCard>

          <h2 className="text-lg font-medium mb-4">Your Deposits</h2>
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
  onEarlyExit: (i: number, percentageBp: number) => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { addToast } = useAppStore();
  const { writeContractAsync } = useWriteContract();
  const { depositData, pendingRewards, isInEarlyExit, earlyExitAmount } = useDepositRead(
    address,
    index
  );
  const { osloBalance } = useTokenReads(address);

  // DEX reserves for OSLO yield conversion
  const { data: dexReserves } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXAbi,
    functionName: "getReserves",
    query: { refetchInterval: 10000 },
  });

  // OSLO allowance check for DEX
  const { data: osloAllowance } = useReadContract({
    address: CONTRACTS.osloToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.osloDEX] : undefined,
    query: { enabled: !!address },
  });

  const deposit = depositData.data as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean] | undefined;
  const pendingUSDT = pendingRewards.data as bigint | undefined;

  const [convertingOslo, setConvertingOslo] = useState(false);
  const [earlyExiting, setEarlyExiting] = useState(false);

  // ─── Real-time yield interpolation ────────────────────────────────────
  // Between contract refetches (every 15s), smoothly interpolate yield using
  // the on-chain cached dailyRate so users see the number ticking up live.
  const [liveElapsed, setLiveElapsed] = useState(0);
  const lastFetchRef = useRef(Date.now());
  const lastPendingRef = useRef<number>(0);

  // Reset interpolation anchor when contract data refreshes
  useEffect(() => {
    if (pendingUSDT != null) {
      lastPendingRef.current = Number(pendingUSDT) / 1e18;
      lastFetchRef.current = Date.now();
      setLiveElapsed(0);
    }
  }, [pendingUSDT]);

  // Tick 4x/sec for smooth yield animation
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveElapsed((Date.now() - lastFetchRef.current) / 1000);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  if (!deposit) return <Skeleton className="h-64" />;

  const [amount, tier, _cachedDailyRate, depositTime, lastClaimTime, totalClaimed, _maxReturn, active] = deposit;
  const amountNum = Number(amount) / 1e18;
  const tierNum = Number(tier);
  const claimedNum = Number(totalClaimed) / 1e18;
  const capProgress = (claimedNum / (amountNum * RETURN_CAP_MULTIPLIER)) * 100;

  // Use TODAY's actual rate from 7-day schedule (not the cached deposit-time rate)
  // This matches what the contract's _calculatePendingRewards actually computes
  const todayRateBp = getDailyRate(amountNum);

  // Live interpolated pending: contractPending + (perSecond * elapsed since last fetch)
  const contractPending = lastPendingRef.current;
  const perSecondUSDT = amountNum * (todayRateBp / 10000) / 86400; // today's rate in bp → decimal / seconds
  const pendingUsdtNum = contractPending + (active ? perSecondUSDT * liveElapsed : 0);

  // Calculate OSLO equivalent of pending USDT yield using DEX rate
  const dexRes = dexReserves as [bigint, bigint] | undefined;
  const dexUsdtNum = dexRes ? Number(dexRes[0]) / 1e18 : 0;
  const dexOsloNum = dexRes ? Number(dexRes[1]) / 1e18 : 0;
  const osloYield = dexUsdtNum > 0 && dexOsloNum > 0 && pendingUsdtNum > 0
    ? (pendingUsdtNum * dexOsloNum) / (dexUsdtNum + pendingUsdtNum)
    : 0;
  // Total claimed converted to OSLO at current DEX rate
  const claimedOslo = dexUsdtNum > 0 && dexOsloNum > 0 && claimedNum > 0
    ? (claimedNum * dexOsloNum) / (dexUsdtNum + claimedNum)
    : 0;
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

  const handleConvertOsloToUSDT = async () => {
    if (!osloBal || osloBal === 0n || !address || !publicClient) return;
    setConvertingOslo(true);
    try {
      // ── Step 1: Approve OSLO if needed ──────────────────────────
      const currentAllowance = (osloAllowance as bigint) || 0n;
      if (currentAllowance < osloBal) {
        addToast({ title: "Approving OSLO for DEX...", status: "pending" });
        const approveTx = await writeContractAsync({
          address: CONTRACTS.osloToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.osloDEX, osloBal],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "OSLO Approved", status: "success", txHash: approveTx });
      }

      // ── Step 2: Swap ───────────────────────────────────────────
      addToast({ title: "Converting OSLO to USDT...", status: "pending" });
      const tx = await writeContractAsync({
        address: CONTRACTS.osloDEX,
        abi: osloDEXAbi,
        functionName: "swapOSLOForUSDT",
        args: [osloBal, 0n],
      });
      addToast({ title: "Converted to USDT!", status: "success", txHash: tx });
    } catch (err: any) {
      if (err?.message?.includes("rejected") || err?.message?.includes("denied")) return;
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

      {/* Accrued — V3: Yield displayed in OSLO, auto-buys on claim */}
      <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-white/[0.03]">
        <div>
          <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
            Yield (OSLO)
          </p>
          <p className="text-sm font-mono text-oslo-text-primary">
            {formatNumber(osloYield, 4)} OSLO
          </p>
        </div>
        <div>
          <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
            Total Claimed
          </p>
          <p className="text-sm font-mono text-oslo-text-primary">
            {formatNumber(claimedOslo, 4)} OSLO
          </p>
        </div>
      </div>

      {/* Live yield ticker */}
      {active && perSecondUSDT > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-oslo-success/5 border border-oslo-success/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-oslo-success animate-pulse" />
              <span className="text-[10px] text-oslo-text-muted">Pending (USDT equiv.)</span>
            </div>
            <span className="text-xs font-mono text-oslo-success">
              ${formatNumber(pendingUsdtNum, 6)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-oslo-text-muted">Earning</span>
            <span className="text-[9px] font-mono text-oslo-text-muted">
              +${(perSecondUSDT * 60).toFixed(6)}/min · ${formatRate(todayRateBp)}/day
            </span>
          </div>
        </div>
      )}

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

      {/* 3X Cap Warning Alert */}
      {capProgress >= 75 && active && (
        <div className="mb-4 p-2.5 rounded-lg bg-oslo-warning/10 border border-oslo-warning/30 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-oslo-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-oslo-warning">
              {capProgress >= 100 ? "3X Cap Reached!" : "Earnings approaching 3X cap!"}
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">
              {capProgress >= 100
                ? "Reinvest your package to continue earning."
                : `${Math.round(capProgress)}% of 3X cap used. Reinvest soon to maintain earnings.`
              }
            </p>
          </div>
        </div>
      )}

      {/* Early Exit — 10-day window with flat 10% fee, paid in USDT */}
      {active && inEarlyExit && exitNetReturn > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-oslo-aurora/5 border border-oslo-aurora/10 space-y-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-oslo-aurora" />
            <span className="text-[10px] text-oslo-aurora font-medium">
              Early Exit Available —{" "}
              <CountdownTimer
                targetTimestamp={exitDeadline}
                className="text-[10px] text-oslo-aurora font-medium"
              />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <span className="text-oslo-text-muted">Principal</span>
            <span className="font-mono text-oslo-text-primary text-right">${formatNumber(exitPrincipal)}</span>
            <span className="text-oslo-text-muted">{EARLY_EXIT_FEE_PCT}% Exit Fee</span>
            <span className="font-mono text-oslo-danger text-right">-${formatNumber(exitFee)}</span>
            <span className="text-oslo-text-muted pt-1 border-t border-white/5">You Receive (USDT)</span>
            <span className="font-mono text-oslo-ice text-right pt-1 border-t border-white/5">${formatNumber(exitNetReturn)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {active && (
        <div className="space-y-2">
          {/* V3: Yield accrues in USDT internally, displayed as OSLO. Claim sends OSLO to wallet. */}
          <p className="text-[10px] text-oslo-text-muted leading-relaxed">
            Yield accrues in OSLO. Claim to receive tokens directly to your wallet — <span className="text-oslo-success">zero fee</span>.
          </p>
          <IceButton
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => onClaim(index)}
            disabled={pendingUsdtNum < 1}
          >
            Claim OSLO
          </IceButton>
          {pendingUsdtNum > 0 && pendingUsdtNum < 1 && (
            <p className="text-[10px] text-oslo-text-muted text-center">
              Minimum $1.00 yield required to claim
            </p>
          )}
        </div>
      )}
      {/* Convert OSLO to USDT — V3: 10% fee (USDT→LP, OSLO→burn) */}
      {osloBalNum > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-oslo-text-muted">
            Sell OSLO for USDT — <span className="text-oslo-aurora">10% fee</span> (to LP + burn)
          </p>
          {/* Allowance indicator */}
          {(() => {
            const allowance = (osloAllowance as bigint) || 0n;
            if (allowance >= (osloBal || 0n)) {
              return (
                <p className="text-[10px] text-oslo-success flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> OSLO approved
                </p>
              );
            }
            return (
              <p className="text-[10px] text-oslo-warning flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Approval required
              </p>
            );
          })()}
          <IceButton
            size="sm"
            variant="primary"
            className="w-full mt-1"
            onClick={handleConvertOsloToUSDT}
            loading={convertingOslo}
            disabled={convertingOslo}
          >
            {(() => {
              const allowance = (osloAllowance as bigint) || 0n;
              if (allowance < (osloBal || 0n)) return `Approve & Sell ${formatNumber(osloBalNum)} OSLO`;
              return `Sell ${formatNumber(osloBalNum)} OSLO → USDT`;
            })()}
          </IceButton>
        </div>
      )}
      {/* Early Exit button — within 10-day window, returns USDT */}
      {active && inEarlyExit && exitNetReturn > 0 && (
        <div className="mt-10 pt-6 border-t-2 border-oslo-danger/20">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-oslo-danger" />
            <span className="text-[11px] font-semibold text-oslo-danger uppercase tracking-wider">
              Early Exit Zone
            </span>
          </div>
          <p className="text-[10px] text-oslo-text-muted mb-3 leading-relaxed">
            Exiting early incurs a {EARLY_EXIT_FEE_PCT}% fee. Choose how much of your deposit to exit:
          </p>
          <div className="mb-3 p-2.5 rounded-lg bg-oslo-danger/5 border border-oslo-danger/10">
            <p className="text-[10px] text-oslo-text-secondary leading-relaxed">
              <strong className="text-oslo-danger">Important:</strong> Upon taking an early exit, any income already received will be deducted, and a {EARLY_EXIT_FEE_PCT}% processing fee will also apply. Only the remaining balance after these deductions will be paid out.
            </p>
          </div>
          <EarlyExitOptions
            principal={exitPrincipal}
            fee={exitFee}
            netReturn={exitNetReturn}
            onExit={(pctBp) => { setEarlyExiting(true); onEarlyExit(index, pctBp); }}
            loading={earlyExiting}
          />
        </div>
      )}
    </GlassCard>
  );
}

// ─── Early Exit Options Component ─────────────────────────────────────────

function EarlyExitOptions({
  principal,
  fee,
  netReturn,
  onExit,
  loading,
}: {
  principal: number;
  fee: number;
  netReturn: number;
  onExit: (percentageBp: number) => void;
  loading: boolean;
}) {
  const [selectedPct, setSelectedPct] = useState(100);
  const exitOptions = [100, 50, 25] as const;

  const selectedPrincipal = principal * (selectedPct / 100);
  const selectedFee = fee * (selectedPct / 100);
  const selectedNet = netReturn * (selectedPct / 100);
  const remainingBalance = principal - selectedPrincipal;
  const remaining3X = remainingBalance * RETURN_CAP_MULTIPLIER;

  return (
    <div className="space-y-3">
      {/* Percentage selector buttons */}
      <div className="grid grid-cols-3 gap-2">
        {exitOptions.map((pct) => (
          <button
            key={pct}
            onClick={() => setSelectedPct(pct)}
            className={`py-2 px-3 rounded-btn text-xs font-medium border transition-all ${
              selectedPct === pct
                ? "bg-oslo-aurora/20 border-oslo-aurora/50 text-oslo-aurora"
                : "bg-white/[0.03] border-white/10 text-oslo-text-muted hover:border-white/20"
            }`}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Breakdown for selected percentage */}
      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-1.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-oslo-text-muted">Exit Amount ({selectedPct}%)</span>
          <span className="font-mono text-oslo-text-primary">${formatNumber(selectedPrincipal)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-oslo-text-muted">{EARLY_EXIT_FEE_PCT}% Fee</span>
          <span className="font-mono text-oslo-danger">-${formatNumber(selectedFee)}</span>
        </div>
        <div className="flex justify-between text-[10px] pt-1 border-t border-white/5">
          <span className="text-oslo-text-muted font-medium">You Receive (USDT)</span>
          <span className="font-mono text-oslo-ice font-medium">${formatNumber(selectedNet)}</span>
        </div>
        {selectedPct < 100 && (
          <div className="flex justify-between text-[10px] pt-1 border-t border-white/5">
            <span className="text-oslo-text-muted">Remaining Balance</span>
            <span className="font-mono text-oslo-success">${formatNumber(remainingBalance)}</span>
          </div>
        )}
        {selectedPct < 100 && (
          <div className="flex justify-between text-[10px]">
            <span className="text-oslo-text-muted">3X on Remaining</span>
            <span className="font-mono text-oslo-success">${formatNumber(remaining3X)}</span>
          </div>
        )}
      </div>

      <IceButton
        size="sm"
        variant="primary"
        className="w-full bg-oslo-aurora hover:bg-oslo-aurora/80"
        onClick={() => onExit(selectedPct * 100)}
        loading={loading}
        disabled={loading}
      >
        Early Exit {selectedPct}% — Get ${formatNumber(selectedNet)} USDT
      </IceButton>
    </div>
  );
}

// ─── Package Helper ─────────────────────────────────────────────────────────

function getTier(amount: number): number {
  if (amount >= 2500) return 2;
  if (amount >= 10) return 1;
  return 0;
}
