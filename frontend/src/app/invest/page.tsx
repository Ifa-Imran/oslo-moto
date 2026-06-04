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
import { useInvestmentEngineReads, useInvestmentEngineWrites } from "@/hooks/useInvestmentEngine";
import { useTokenReads, useUSDTReads } from "@/hooks/useToken";
import { useReferralReads } from "@/hooks/useReferral";
import { useRankSystemReads } from "@/hooks/useRankSystem";
import { useDAOReads } from "@/hooks/useDAO";
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

export default function InvestPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useAppStore();
  const publicClient = usePublicClient();
  const {
    totalActiveDeposit,
    userTier,
    launchTimestamp,
    combinedEarnings,
    pendingRewards,
    isInEarlyExit,
    userPool,
  } = useInvestmentEngineReads(address);
  const { deposit, claimRewards, earlyExit, partialEarlyExit, isLoading } =
    useInvestmentEngineWrites();
  const { usdtBalance } = useUSDTReads(address);
  const { referralRewards } = useReferralReads(address);
  const { pendingBonus } = useRankSystemReads(address);
  const { pendingRoyalty } = useDAOReads(address);
  const { osloBalance } = useTokenReads(address);
  const userUsdtBalance = usdtBalance?.data as bigint | undefined;
  const userUsdtNum = userUsdtBalance ? Number(userUsdtBalance) / 1e18 : 0;

  const [amount, setAmount] = useState("");
  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "depositing">("idle");

  // ─── USDT Allowance Check ────────────────────────────────────────────
  const { data: usdtAllowance } = useReadContract({
    address: CONTRACTS.usdt,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.osloVault] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync: approveAsync } = useWriteContract();

  const tier = Number(userTier.data || 0);
  const activeDepositWei = totalActiveDeposit.data as bigint | undefined;
  const activeDepositNum = activeDepositWei ? Number(activeDepositWei) / 1e18 : 0;
  const amountNum = parseFloat(amount) || 0;
  const predictedTier = amountNum >= 10 ? getTier(amountNum + activeDepositNum) : 0;
  const effectiveRateBp = amountNum >= 10 ? getDailyRate(amountNum + activeDepositNum) : 0;
  const dailyRate = effectiveRateBp / 100;
  const lifetimeActive = isLifetimeRateActive();
  const dailyYield = (amountNum + activeDepositNum) * (dailyRate / 100);
  const threeXCap = (amountNum + activeDepositNum) * RETURN_CAP_MULTIPLIER;

  // ─── Consolidated Income Tracking ──────────────────────────────────────
  const combinedEarningsWei = combinedEarnings.data as bigint | undefined;
  const combinedEarningsNum = combinedEarningsWei ? Number(combinedEarningsWei) / 1e18 : 0;
  const referralRewardsWei = referralRewards.data as bigint | undefined;
  const referralRewardsNum = referralRewardsWei ? Number(referralRewardsWei) / 1e18 : 0;
  const pendingBonusWei = pendingBonus.data as bigint | undefined;
  const pendingBonusNum = pendingBonusWei ? Number(pendingBonusWei) / 1e18 : 0;
  const pendingRoyaltyWei = pendingRoyalty.data as bigint | undefined;
  const pendingRoyaltyNum = pendingRoyaltyWei ? Number(pendingRoyaltyWei) / 1e18 : 0;
  const yieldClaimedNum = Math.max(0, combinedEarningsNum - referralRewardsNum);
  const totalCapLimit = activeDepositNum * RETURN_CAP_MULTIPLIER;
  const capRemainingNum = Math.max(0, totalCapLimit - combinedEarningsNum);
  const capUsedPct = totalCapLimit > 0 ? (combinedEarningsNum / totalCapLimit) * 100 : 0;

  // ─── DEX reserves for OSLO yield conversion ────────────────────────────
  const { data: dexReserves } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXAbi,
    functionName: "getReserves",
    query: { refetchInterval: 10000 },
  });

  // ─── OSLO allowance for DEX ────────────────────────────────────────────
  const { data: osloAllowance } = useReadContract({
    address: CONTRACTS.osloToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.osloDEX] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync: swapWriteAsync } = useWriteContract();

  // ─── Real-time yield interpolation (monotonic) ──────────────────────────
  const pendingUSDTRaw = pendingRewards.data as bigint | undefined;
  const [liveElapsed, setLiveElapsed] = useState(0);
  const lastFetchRef = useRef(Date.now());
  const lastPendingRef = useRef<number>(0);
  const displayFloorRef = useRef<number>(0);
  const osloFloorRef = useRef<number>(0);

  useEffect(() => {
    if (pendingUSDTRaw != null) {
      const newValue = Number(pendingUSDTRaw) / 1e18;
      if (lastPendingRef.current > 0 && newValue < lastPendingRef.current * 0.5) {
        displayFloorRef.current = 0;
        osloFloorRef.current = 0;
      }
      lastPendingRef.current = newValue;
      lastFetchRef.current = Date.now();
      setLiveElapsed(0);
    }
  }, [pendingUSDTRaw]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveElapsed((Date.now() - lastFetchRef.current) / 1000);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Interpolated pending yield
  const todayRateBp = activeDepositNum > 0 ? getDailyRate(activeDepositNum) : 0;
  const perSecondUSDT = activeDepositNum * (todayRateBp / 10000) / 86400;
  const contractPending = lastPendingRef.current;
  const poolActive = (userPool?.data as any)?.[7] ?? true;
  const rawPending = contractPending + (poolActive ? perSecondUSDT * liveElapsed : 0);
  const pendingUsdtNum = Math.max(rawPending, displayFloorRef.current);
  displayFloorRef.current = pendingUsdtNum;

  // OSLO conversion
  const dexRes = dexReserves as [bigint, bigint] | undefined;
  const dexUsdtNum = dexRes ? Number(dexRes[0]) / 1e18 : 0;
  const dexOsloNum = dexRes ? Number(dexRes[1]) / 1e18 : 0;
  const rawOsloYield = dexUsdtNum > 0 && dexOsloNum > 0 && pendingUsdtNum > 0
    ? (pendingUsdtNum * dexOsloNum) / (dexUsdtNum + pendingUsdtNum)
    : 0;
  const osloYield = Math.max(rawOsloYield, osloFloorRef.current);
  osloFloorRef.current = osloYield;

  const osloBal = osloBalance?.data as bigint | undefined;
  const osloBalNum = osloBal ? Number(osloBal) / 1e18 : 0;

  // Early exit data
  const inEarlyExit = (isInEarlyExit?.data as boolean) || false;
  const poolData = userPool?.data as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean] | undefined;
  const lastDepositTimestamp = poolData ? Number(poolData[6]) : 0;
  const exitDeadline = lastDepositTimestamp + EARLY_EXIT_PERIOD_SECONDS;
  const exitFee = activeDepositNum * 0.1;
  const exitNetReturn = activeDepositNum - exitFee;

  const [convertingOslo, setConvertingOslo] = useState(false);
  const [earlyExiting, setEarlyExiting] = useState(false);

  const handleDeposit = async () => {
    if (!amountNum || !address || !publicClient) return;

    const depositAmount = parseEther(amount);
    const currentAllowance = (usdtAllowance as bigint) || 0n;

    try {
      if (currentAllowance < depositAmount) {
        setFlowStep("approving");
        addToast({ title: "Approving USDT...", status: "pending" });

        const approveTx = await approveAsync({
          address: CONTRACTS.usdt,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.osloVault, maxUint256],
        });

        addToast({
          title: "Approval Submitted",
          description: "Waiting for confirmation...",
          status: "pending",
          txHash: approveTx,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        await new Promise(resolve => setTimeout(resolve, 3000));
        addToast({ title: "USDT Approved", status: "success", txHash: approveTx });
      }

      setFlowStep("depositing");
      addToast({
        title: "Depositing USDT...",
        description: `${amountNum} USDT → Consolidated Pool`,
        status: "pending",
      });

      const tx = await deposit(depositAmount);

      addToast({
        title: "Deposit Successful!",
        description: `${formatNumber(amountNum)} USDT added to your pool`,
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

  const handleClaim = async () => {
    try {
      addToast({ title: "Claiming Rewards...", status: "pending" });
      const tx = await claimRewards();
      addToast({ title: "Rewards Claimed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Claim Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    }
  };

  const handleEarlyExit = async (percentageBp: number = 10000) => {
    setEarlyExiting(true);
    try {
      addToast({ title: `Early Exit ${percentageBp / 100}% — Returning USDT...`, status: "pending" });
      const tx = await partialEarlyExit(percentageBp);
      addToast({ title: "Early Exit Complete — USDT Returned", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Early Exit Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    } finally {
      setEarlyExiting(false);
    }
  };

  const handleConvertOsloToUSDT = async () => {
    if (!osloBal || osloBal === 0n || !address || !publicClient) return;
    setConvertingOslo(true);
    try {
      const currentAllowance = (osloAllowance as bigint) || 0n;
      if (currentAllowance < osloBal) {
        addToast({ title: "Approving OSLO for DEX...", status: "pending" });
        const approveTx = await swapWriteAsync({
          address: CONTRACTS.osloToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.osloDEX, osloBal],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "OSLO Approved", status: "success", txHash: approveTx });
      }

      addToast({ title: "Converting OSLO to USDT...", status: "pending" });
      const tx = await swapWriteAsync({
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Staking Engine</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          Deposit USDT and earn daily OSLO yields — all deposits merge into a single pool — {lifetimeActive ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}` : `${tier > 0 ? formatRate(getDailyRate(activeDepositNum)) : '0.55% – 1.25%'} daily`}
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
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Held in Vault for rewards</p>
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
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Applied on every deposit</p>
          </div>
        </div>
      </div>

      {/* Deposit Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                Min $10 — Max ${MAX_DEPOSIT_PER_TX.toLocaleString()} per transaction. All deposits merge into your pool.
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
                {activeDepositNum > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-oslo-text-muted">New Total Pool</span>
                    <span className="font-mono text-oslo-ice">{formatNumber(amountNum + activeDepositNum)} USDT</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">To Liquidity Pool (98%)</span>
                  <span className="font-mono text-oslo-ice">{formatNumber(amountNum * 0.98)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">To Reward Wallet (1%)</span>
                  <span className="font-mono text-oslo-success">{formatNumber(amountNum * 0.01)} USDT</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                  <span className="text-oslo-text-muted">Tier (after deposit)</span>
                  <TierBadge tier={predictedTier} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-oslo-text-muted">Daily Rate</span>
                  <span className="font-mono text-oslo-ice">{formatRate(effectiveRateBp)}</span>
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
                <span className="text-oslo-danger">Max ${MAX_DEPOSIT_PER_TX.toLocaleString()} per transaction.</span>
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
                return activeDepositNum > 0 ? "Add to Pool" : "Deposit USDT";
              })()}
            </IceButton>
          </div>
        </GlassCard>
      </div>

      {/* Consolidated Pool View */}
      {isConnected && activeDepositNum > 0 && (
        <div className="space-y-6">
          {/* Income & 3X Cap Panel */}
          <GlassCard>
            <h2 className="text-lg font-medium mb-4">Income & 3X Cap Tracker</h2>

            {/* Row 1: Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Total Pool</p>
                <p className="text-lg font-mono text-oslo-text-primary">${formatNumber(activeDepositNum)}</p>
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Total Earnings</p>
                <p className="text-lg font-mono text-oslo-success">${formatNumber(combinedEarningsNum)}</p>
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Current Tier</p>
                <TierBadge tier={tier} />
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">3X Remaining</p>
                <p className={`text-lg font-mono ${capRemainingNum < totalCapLimit * 0.25 ? 'text-oslo-warning' : 'text-oslo-text-primary'}`}>
                  ${formatNumber(capRemainingNum)}
                </p>
              </div>
            </div>

            {/* Row 2: 3X Cap Progress Bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">3X Cap Progress</span>
                <span className="text-[10px] font-mono text-oslo-text-secondary">
                  ${formatNumber(combinedEarningsNum)} / ${formatNumber(totalCapLimit)} ({Math.min(capUsedPct, 100).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    capUsedPct >= 90 ? 'bg-oslo-danger' :
                    capUsedPct >= 75 ? 'bg-oslo-warning' : 'bg-oslo-ice'
                  }`}
                  style={{ width: `${Math.min(capUsedPct, 100)}%` }}
                />
              </div>
            </div>

            {/* Row 3: Income Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Droplets className="w-3 h-3 text-oslo-ice" />
                  <p className="text-[9px] text-oslo-text-muted uppercase tracking-wider">Yield Income</p>
                </div>
                <p className="text-sm font-mono text-oslo-text-primary">${formatNumber(yieldClaimedNum)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Gift className="w-3 h-3 text-oslo-aurora" />
                  <p className="text-[9px] text-oslo-text-muted uppercase tracking-wider">Level Income</p>
                </div>
                <p className="text-sm font-mono text-oslo-text-primary">${formatNumber(referralRewardsNum)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 className="w-3 h-3 text-oslo-success" />
                  <p className="text-[9px] text-oslo-text-muted uppercase tracking-wider">Weekly Rank</p>
                </div>
                <p className="text-sm font-mono text-oslo-text-primary">${formatNumber(pendingBonusNum)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3 h-3 text-purple-400" />
                  <p className="text-[9px] text-oslo-text-muted uppercase tracking-wider">Monthly DAO</p>
                </div>
                <p className="text-sm font-mono text-oslo-text-primary">${formatNumber(pendingRoyaltyNum)}</p>
              </div>
            </div>

            {/* 3X Cap Alert */}
            {capUsedPct >= 90 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-3 rounded-lg bg-oslo-warning/10 border border-oslo-warning/30 flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-oslo-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-oslo-warning">
                    {capUsedPct >= 100 ? "3X Earnings Cap Reached!" : "Approaching 3X Cap!"}
                  </p>
                  <p className="text-xs text-oslo-text-muted mt-1">
                    {capUsedPct >= 100
                      ? <>Your earnings have reached the 3X limit. To continue earning, please <span className="text-oslo-ice font-medium">reinvest your package</span>.</>
                      : <>{Math.round(capUsedPct)}% of your 3X cap used. Reinvest soon to maintain earnings.</>
                    }
                  </p>
                </div>
              </motion.div>
            )}
          </GlassCard>

          {/* Your Staking Pool — Single Card */}
          <GlassCard className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium">Your Staking Pool</h2>
                <p className="text-xs text-oslo-text-muted mt-0.5">All deposits consolidated into one pool</p>
              </div>
              <TierBadge tier={tier} />
            </div>

            {/* Pool Balance */}
            <div className="mb-5">
              <p className="text-xs text-oslo-text-muted uppercase tracking-wider">Total Pool Balance</p>
              <p className="text-2xl font-mono font-light text-oslo-text-primary">
                ${formatNumber(activeDepositNum)}
              </p>
              <p className="text-[10px] text-oslo-text-muted mt-0.5">
                Daily rate: {formatRate(getDailyRate(activeDepositNum))} · 3X Cap: ${formatNumber(totalCapLimit)}
              </p>
            </div>

            {/* Yield Section */}
            <div className="grid grid-cols-2 gap-4 mb-5 p-4 rounded-lg bg-white/[0.03] border border-white/5">
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Pending Yield (OSLO)</p>
                <p className="text-lg font-mono text-oslo-ice">
                  {formatNumber(osloYield, 4)} OSLO
                </p>
                <p className="text-[10px] text-oslo-text-muted">≈ ${formatNumber(pendingUsdtNum)} USDT</p>
              </div>
              <div>
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">Total Claimed</p>
                <p className="text-lg font-mono text-oslo-success">
                  ${formatNumber(combinedEarningsNum)}
                </p>
              </div>
            </div>

            {/* 3X Cap Progress (pool level) */}
            <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-white/[0.02]">
              <ProgressRing
                progress={Math.min(capUsedPct, 100)}
                size={40}
                strokeWidth={3}
                color={capUsedPct >= 75 ? "warning" : "ice"}
              />
              <div>
                <p className="text-[10px] text-oslo-text-muted">Pool 3X Cap</p>
                <p className="text-sm font-mono text-oslo-text-primary">
                  ${formatNumber(combinedEarningsNum)} / ${formatNumber(totalCapLimit)}
                  <span className="text-oslo-text-muted ml-1">({Math.min(capUsedPct, 100).toFixed(0)}%)</span>
                </p>
              </div>
            </div>

            {/* OSLO Balance */}
            {osloBalNum > 0 && (
              <div className="mb-5 p-3 rounded-lg bg-oslo-ice/5 border border-oslo-ice/10">
                <p className="text-[10px] text-oslo-text-muted uppercase tracking-wider">OSLO Balance (from claims)</p>
                <p className="text-sm font-mono text-oslo-ice">{formatNumber(osloBalNum)} OSLO</p>
              </div>
            )}

            {/* Claim Button */}
            {poolActive && (
              <div className="space-y-2 mb-5">
                <p className="text-[10px] text-oslo-text-muted leading-relaxed">
                  Yield accrues in OSLO. Claim to receive tokens directly to your wallet — <span className="text-oslo-success">zero fee</span>.
                </p>
                <IceButton
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={handleClaim}
                  disabled={pendingUsdtNum < 1 || isLoading}
                  loading={isLoading}
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

            {/* Convert OSLO to USDT */}
            {osloBalNum > 0 && (
              <div className="space-y-1 mb-5">
                <p className="text-[10px] text-oslo-text-muted">
                  Sell OSLO for USDT — <span className="text-oslo-aurora">10% fee</span> (to LP + burn)
                </p>
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

            {/* Early Exit Section */}
            {poolActive && inEarlyExit && activeDepositNum > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-oslo-danger/20">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-oslo-danger" />
                  <span className="text-[11px] font-semibold text-oslo-danger uppercase tracking-wider">
                    Early Exit Zone
                  </span>
                </div>

                <div className="mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-oslo-aurora" />
                  <span className="text-[10px] text-oslo-aurora font-medium">
                    Early Exit Available —{" "}
                    <CountdownTimer
                      targetTimestamp={exitDeadline}
                      className="text-[10px] text-oslo-aurora font-medium"
                    />
                  </span>
                </div>

                <p className="text-[10px] text-oslo-text-muted mb-3 leading-relaxed">
                  Exiting early incurs a {EARLY_EXIT_FEE_PCT}% fee. Choose how much of your pool to exit:
                </p>
                <div className="mb-3 p-2.5 rounded-lg bg-oslo-danger/5 border border-oslo-danger/10">
                  <p className="text-[10px] text-oslo-text-secondary leading-relaxed">
                    <strong className="text-oslo-danger">Important:</strong> Upon taking an early exit, any income already received will be deducted, and a {EARLY_EXIT_FEE_PCT}% processing fee will also apply.
                  </p>
                </div>
                <EarlyExitOptions
                  principal={activeDepositNum}
                  fee={exitFee}
                  netReturn={exitNetReturn}
                  onExit={handleEarlyExit}
                  loading={earlyExiting}
                />
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
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
  onExit: (percentageBp: number) => void | Promise<void>;
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
            <span className="text-oslo-text-muted">Remaining Pool</span>
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
