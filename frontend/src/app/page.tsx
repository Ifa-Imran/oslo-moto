"use client";

import { useState, useEffect, Suspense } from "react";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { parseEther, erc20Abi } from "viem";
import type { Address } from "viem";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { TierBadge } from "@/components/ui/TierBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { AddressChip } from "@/components/ui/AddressChip";
import { RealTimeYield } from "@/components/dashboard/RealTimeYield";
import { AllocationBreakdown } from "@/components/dashboard/AllocationBreakdown";
import { useInvestmentEngineReads, useInvestmentEngineWrites } from "@/hooks/useInvestmentEngine";
import investmentEngineAbi from "@/abis/OSLOVault.json";
import { useTokenReads, useUSDTReads } from "@/hooks/useToken";
import { useLiquidityManagerReads } from "@/hooks/useLiquidityManager";
import { useOSLODEX } from "@/hooks/useOSLODEX";
import { useReferralReads, useReferralWrites } from "@/hooks/useReferral";
import { useAppStore } from "@/store/useAppStore";
import { CONTRACTS } from "@/lib/contracts";
import { formatToken, formatNumber, formatCompact, truncateAddress } from "@/lib/utils";
import { RETURN_CAP_MULTIPLIER, getDailyRate, formatRate, isLifetimeRateActive, LIFETIME_RATE_BP, LIFETIME_RATE_START, LAUNCH_TIMESTAMP, LEVEL_UNLOCK_THRESHOLDS, REFERRAL_COMMISSION_RATES, getTodayScheduleRate } from "@/lib/constants";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Wallet,
  Zap,
  Users,
  ArrowRight,
  Activity,
  Clock,
  LogIn,
  Coins,
  UserPlus,
  ShieldCheck,
  Globe,
  Layers,
  Droplets,
  Gift,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  BarChart3,
} from "lucide-react";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-48 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <LandingPage />
    </Suspense>
  );
}

function LandingPage() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const { addToast } = useAppStore();
  const publicClient = usePublicClient();
  const { writeContractAsync: approveAsync } = useWriteContract();

  // Registration check
  const { isRegistered, referrer, totalRegistered, userInfoData, directReferrals, referralRewards, allLevelIncome, unlockedLevels } = useReferralReads(address);
  const { register, claimReferralRewards, isLoading: isRegistering } = useReferralWrites();
  const { claimRewards: claimYieldRewards, isLoading: isClaimingYield } = useInvestmentEngineWrites();

  // Dashboard data (when registered)
  const { totalActiveDeposit, userTier, totalDeposited, totalRewardsPaid, totalWithdrawn, launchTimestamp } =
    useInvestmentEngineReads(address);
  const { totalBurned, osloBalance, totalSupply } = useTokenReads(address);
  const { usdtBalance } = useUSDTReads(address);

  // Liquidity pool data
  const { totalLiquidityAdded } = useLiquidityManagerReads();
  
  // OSLODEX price and reserves
  const { price: osloPrice, usdtReserve, osloReserve } = useOSLODEX();

  // Pending ROI for first deposit
  const {
    data: pendingRewardsData,
    refetch: refetchPending,
  } = useReadContract({
    address: CONTRACTS.osloVault,
    abi: investmentEngineAbi,
    functionName: "getPendingRewards",
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address && isConnected },
  });

  // ─── Force refetch OSLO balance after registration ───────────────
  const [justRegistered, setJustRegistered] = useState(false);
  useEffect(() => {
    if (justRegistered) {
      const t = setTimeout(() => { refetchPending?.(); setJustRegistered(false); }, 3000);
      return () => clearTimeout(t);
    }
  }, [justRegistered, refetchPending]);

  // USDT allowance check for referral contract (used for approval if needed)
  const { data: usdtAllowanceForReferral } = useReadContract({
    address: CONTRACTS.usdt,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.referral] : undefined,
    query: { enabled: !!address },
  });

  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "registering">("idle");

  // Check on-chain registration status
  const registered = isRegistered.isLoading ? undefined : (isRegistered.data as boolean | undefined);
  const tier = Number(userTier.data || 0);
  const activeDeposit = totalActiveDeposit.data as bigint | undefined;
  const activeDepositNum = activeDeposit ? Number(activeDeposit) / 1e18 : 0;
  const hasDeposits = activeDepositNum > 0;

  // Referrer from URL param
  const [referrerInput, setReferrerInput] = useState("");
  const refParam = searchParams.get("ref");

  useEffect(() => {
    if (refParam) setReferrerInput(refParam);
  }, [refParam]);

  const handleRegister = async () => {
    if (!address || !publicClient) return;
    // First user: register with zero address (root); subsequent users: require referrer
    const totalReg = (totalRegistered.data as bigint) || 0n;
    if (totalReg > 0n && !referrerInput) return;

    const ref = totalReg === 0n
      ? ("0x0000000000000000000000000000000000000000" as Address)
      : (referrerInput as Address);

    try {
      // ── Step 1: Approve $1 USDT for referral contract ──────────
      const feeAmount = parseEther("1");
      const currentAllowance = (usdtAllowanceForReferral as bigint) || 0n;

      if (currentAllowance < feeAmount) {
        setFlowStep("approving");
        addToast({ title: "Approving $1 USDT for registration...", status: "pending" });

        const approveTx = await approveAsync({
          address: CONTRACTS.usdt,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.referral, feeAmount],
        });

        addToast({
          title: "Approval Submitted",
          description: "Waiting for confirmation...",
          status: "pending",
          txHash: approveTx,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "$1 USDT Approved", status: "success", txHash: approveTx });
      }

      // ── Step 2: Register ────────────────────────────────────
      setFlowStep("registering");
      addToast({ title: "Registering ($1 fee)...", status: "pending" });
      const tx = await register(address, ref);
      addToast({ title: "Registration submitted!", status: "success", txHash: tx });
      setJustRegistered(true);
      setFlowStep("idle");
    } catch (err: any) {
      setFlowStep("idle");
      addToast({
        title: "Registration Failed",
        description: err?.message?.slice(0, 100) || "Transaction rejected",
        status: "error",
      });
    }
  };

  // ─── STATE 1: Not Connected ─────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="space-y-12">
        {/* Hero */}
        <div className="text-center py-12 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-oslo-ice/10 border border-oslo-ice/20 text-xs text-oslo-ice mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-oslo-ice animate-pulse" />
              BNB Smart Chain
            </div>
            <h1 className="text-4xl md:text-6xl font-light tracking-tight text-oslo-text-primary leading-tight">
              OSLO Protocol
            </h1>
            <p className="mt-4 text-lg md:text-xl text-oslo-text-secondary max-w-2xl mx-auto font-light">
              A multi-tiered DeFi investment ecosystem. Stake USDT, earn daily
              yields, build 20-level referral networks, and earn DAO royalties.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-10"
          >
            <div className="inline-flex flex-col items-center gap-3 p-6 rounded-2xl bg-oslo-ice/5 border border-oslo-ice/20">
              <LogIn className="w-8 h-8 text-oslo-ice" />
              <p className="text-sm text-oslo-text-secondary">
                Connect your wallet to get started
              </p>
              <p className="text-xs text-oslo-text-muted max-w-sm">
                Use the &quot;Connect Wallet&quot; button in the top-right corner.
                BSC Mainnet supported via MetaMask, Trust Wallet, and WalletConnect.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Layers,
              title: "4-Tier Staking",
              desc: "Earn 0.50%–1.75% daily returns based on your deposit tier, up to 3X cap.",
            },
            {
              icon: Users,
              title: "20-Level Referrals",
              desc: "Build a network across 20 levels with commission rates up to 30%.",
            },
            {
              icon: Gift,
              title: "Weekly Rank Bonuses",
              desc: "7 competitive ranks from Bronze to Grandmaster with weekly USDT bonuses.",
            },
            {
              icon: ShieldCheck,
              title: "DAO Royalties",
              desc: "Top 200 members earn monthly royalties from protocol turnover.",
            },
          ].map((feature) => (
            <GlassCard key={feature.title} className="p-5 text-center">
              <feature.icon className="w-8 h-8 text-oslo-ice mx-auto mb-3" />
              <h3 className="text-sm font-medium text-oslo-text-primary mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-oslo-text-muted leading-relaxed">
                {feature.desc}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Contract Links */}
        <div className="text-center">
          <p className="text-xs text-oslo-text-muted">
            Verified on BSC Mainnet ·{" "}
            <a
              href={`https://bscscan.com/address/${CONTRACTS.osloVault}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-oslo-ice hover:underline inline-flex items-center gap-1"
            >
              View Contracts <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ─── STATE 2.5: Loading registration status ────────────────
  if (registered === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-oslo-ice mx-auto mb-4"></div>
          <p className="text-sm text-oslo-text-secondary">Checking registration status...</p>
        </div>
      </div>
    );
  }

  // ─── STATE 2: Connected but NOT Registered ─────────────────────────────
  if (!registered) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <GlassCard className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-oslo-ice/10 border border-oslo-ice/20 mb-6">
              <Users className="w-8 h-8 text-oslo-ice" />
            </div>
            <h2 className="text-2xl font-light text-oslo-text-primary mb-2">Register to OSLO Protocol</h2>
            <p className="text-sm text-oslo-text-secondary mb-6">
              Join the OSLO ecosystem. A one-time $1 USDT registration fee is required.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-oslo-text-muted mb-1.5 text-left">Referrer Address</label>
                <input
                  type="text"
                  placeholder="0x... (referrer wallet address)"
                  value={referrerInput}
                  onChange={(e) => setReferrerInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-oslo-dark/50 border border-oslo-ice/20 text-sm text-white placeholder:text-oslo-text-muted focus:outline-none focus:border-oslo-ice/50 transition-colors"
                />
                {refParam && (
                  <p className="text-xs text-oslo-ice mt-1">Referrer set from link</p>
                )}
              </div>

              <button
                onClick={handleRegister}
                disabled={isRegistering || flowStep !== "idle"}
                className="w-full px-6 py-3 rounded-lg bg-oslo-ice/20 hover:bg-oslo-ice/30 border border-oslo-ice/30 text-oslo-ice font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {flowStep === "approving"
                  ? "Approving USDT..."
                  : flowStep === "registering"
                  ? "Registering..."
                  : "Register ($1 USDT)"}
              </button>

              <p className="text-xs text-oslo-text-muted">
                Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // ─── STATE 3: Registered — Dashboard ─────────────────────────────────
  const dailyRate = getDailyRate(activeDeposit ? Number(formatToken(activeDeposit, 0)) : 10);
  const lifetimeActive = isLifetimeRateActive();
  const totalReg = Number((totalRegistered.data as bigint) || 0n);

  // Pending ROI calculation
  const pendingBigint = pendingRewardsData as bigint | undefined;
  const pendingTotal = pendingBigint || 0n;
  const pendingTotalNum = Number(pendingTotal) / 1e18;
  const usdtBal = usdtBalance.data as bigint | undefined;
  const osloBal = osloBalance.data as bigint | undefined;
  const osloPriceNum = parseFloat(osloPrice) || 0;
  const pendingOsloAmt = osloPriceNum > 0 ? pendingTotalNum / osloPriceNum : 0;
  const dailyYieldNum = activeDepositNum * (dailyRate / 100);
  const dailyYieldOslo = osloPriceNum > 0 ? dailyYieldNum / osloPriceNum : 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-light tracking-tight text-oslo-text-primary">
          Protocol Overview
        </h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          {isConnected
            ? "Your command center for the OSLO ecosystem"
            : "Connect your wallet to access the OSLO investment platform"}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-xs text-oslo-ice bg-oslo-ice/10 px-2 py-0.5 rounded-full">
            {lifetimeActive ? `Lifetime ${formatRate(LIFETIME_RATE_BP)}` : formatRate(dailyRate) + " daily"}
          </span>
          <span className="text-xs text-oslo-text-muted">
            {totalReg.toLocaleString()} registered users
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/swap">
          <IceButton variant="primary" size="sm">
            <Activity className="w-4 h-4 mr-2" />
            Swap on OSLO DEX
          </IceButton>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Value Locked"
          value={`$${formatNumber(Number(usdtReserve), 2)}`}
          subValue={totalRegistered.data != null ? `${String(totalRegistered.data)} users registered` : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Your Portfolio"
          value={isConnected && activeDeposit != null ? `$${formatToken(activeDeposit, 0)}` : "$0.00"}
          subValue={isConnected ? `USDT: $${usdtBal != null ? formatToken(usdtBal, 0) : "0"} · OSLO: ${osloBal != null ? formatToken(osloBal, 0) : "0"}` : undefined}
          icon={<Wallet className="w-4 h-4" />}
        />
        <StatCard
          label="Pending Yield"
          value={`$${formatNumber(pendingTotalNum, 4)}`}
          subValue={osloPriceNum > 0 ? `${formatNumber(pendingOsloAmt, 2)} OSLO` : "Accruing in real-time"}
          icon={<Coins className="w-4 h-4" />}
        />
        <StatCard
          label="Your Tier"
          value={tier ? `Tier ${tier}` : "—"}
          subValue={`${formatRate(dailyRate)} daily · ${RETURN_CAP_MULTIPLIER}X cap`}
          icon={<Layers className="w-4 h-4" />}
        />
        <StatCard
          label="Liquidity Pool"
          value={`$${formatNumber(Number(usdtReserve), 2)}`}
          subValue={`OSLO Price: $${parseFloat(osloPrice).toFixed(6)}`}
          icon={<Droplets className="w-4 h-4" />}
        />
        <StatCard
          label="DEX Reserves"
          value={`${formatCompact(usdtReserve)} USDT`}
          subValue={`${formatCompact(osloReserve)} OSLO · $${Number(usdtReserve).toLocaleString()} TVL`}
          icon={<Activity className="w-4 h-4" />}
        />
      </div>

      {/* Live Yield Dashboard */}
      {isConnected && registered && activeDeposit && activeDeposit > 0n && (() => {
        const todayRate = getTodayScheduleRate(activeDepositNum);
        return (
          <RealTimeYield
            deposits={[{
              amount: activeDepositNum,
              dailyRate: todayRate,
              pendingUSDT: pendingTotalNum,
              active: true,
            }]}
            osloPrice={osloPriceNum}
          />
        );
      })()}

      {/* ─── Unified Leader Earnings Panel ─── */}
      {isConnected && registered && (() => {
        const rewards = referralRewards.data as bigint | undefined;
        const rewardsNum = rewards ? Number(rewards) / 1e18 : 0;
        const rewardsOslo = osloPriceNum > 0 ? rewardsNum / osloPriceNum : 0;
        const totalEarnings = pendingTotalNum + rewardsNum;
        const totalEarningsOslo = osloPriceNum > 0 ? totalEarnings / osloPriceNum : 0;

        const handleClaimYield = async () => {
          try {
            addToast({ title: "Claiming Investment Yield...", status: "pending" });
            const tx = await claimYieldRewards();
            addToast({ title: "Yield Claimed!", status: "success", txHash: tx });
            refetchPending?.();
          } catch (err: any) {
            addToast({ title: "Claim Failed", description: err?.message?.slice(0, 100), status: "error" });
          }
        };

        const handleClaimCommissions = async () => {
          try {
            addToast({ title: "Claiming Level Commissions...", status: "pending" });
            const tx = await claimReferralRewards();
            addToast({ title: "Commissions Claimed!", status: "success", txHash: tx });
          } catch (err: any) {
            addToast({ title: "Claim Failed", description: err?.message?.slice(0, 100), status: "error" });
          }
        };

        return (
          <GlassCard>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-oslo-ice" />
                <h2 className="text-lg font-medium text-oslo-text-primary">
                  My Earnings
                </h2>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-oslo-success">
                  ${formatNumber(totalEarnings, 4)} USDT
                </p>
                {osloPriceNum > 0 && (
                  <p className="text-[10px] text-oslo-text-muted">
                    ≈ {formatNumber(totalEarningsOslo, 2)} OSLO
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pending Investment Yield */}
              <div className="p-4 rounded-xl bg-oslo-ice/5 border border-oslo-ice/10">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-4 h-4 text-oslo-ice" />
                  <span className="text-xs text-oslo-text-muted uppercase tracking-wider">
                    Investment Yield
                  </span>
                </div>
                <p className="text-2xl font-mono font-light text-oslo-ice">
                  ${formatNumber(pendingTotalNum, 4)}
                </p>
                {osloPriceNum > 0 && (
                  <p className="text-xs text-oslo-text-muted mt-0.5">
                    ≈ {formatNumber(pendingOsloAmt, 2)} OSLO
                  </p>
                )}
                <p className="text-[10px] text-oslo-text-muted mt-2 mb-3">
                  Accrued from your active deposits — paid in OSLO
                </p>
                <IceButton
                  onClick={handleClaimYield}
                  disabled={pendingTotalNum < 1 || isClaimingYield}
                  loading={isClaimingYield}
                  size="sm"
                  className="w-full"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                  Claim Yield
                </IceButton>
                {pendingTotalNum > 0 && pendingTotalNum < 1 && (
                  <p className="text-[10px] text-oslo-text-muted text-center mt-2">
                    Minimum $1.00 required to claim
                  </p>
                )}
              </div>

              {/* Pending Level Commissions */}
              <div className="p-4 rounded-xl bg-oslo-success/5 border border-oslo-success/10">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-oslo-success" />
                  <span className="text-xs text-oslo-text-muted uppercase tracking-wider">
                    Level Commissions
                  </span>
                </div>
                <p className="text-2xl font-mono font-light text-oslo-success">
                  ${formatNumber(rewardsNum, 4)}
                </p>
                {osloPriceNum > 0 && (
                  <p className="text-xs text-oslo-text-muted mt-0.5">
                    ≈ {formatNumber(rewardsOslo, 2)} OSLO
                  </p>
                )}
                <p className="text-[10px] text-oslo-text-muted mt-2 mb-3">
                  Earned from your team&apos;s yield claims — paid in OSLO
                </p>
                <IceButton
                  onClick={handleClaimCommissions}
                  disabled={rewardsNum < 1 || isRegistering}
                  loading={isRegistering}
                  size="sm"
                  variant="ghost"
                  className="w-full border border-oslo-success/30 hover:bg-oslo-success/10"
                >
                  <Gift className="w-3.5 h-3.5 mr-1.5" />
                  Claim Commissions
                </IceButton>
                {rewardsNum > 0 && rewardsNum < 1 && (
                  <p className="text-[10px] text-oslo-text-muted text-center mt-2">
                    Minimum $1.00 required to claim
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-[10px] text-oslo-text-secondary">
                <strong className="text-oslo-text-primary">Combined Earnings:</strong>{" "}
                Investment yield is paid in OSLO tokens at current DEX price. Level commissions from your referral tree are also paid in OSLO at current DEX rate.
                Both can be claimed independently at any time.
              </p>
              <p className="text-[10px] text-oslo-success mt-2">
                <strong>Note:</strong> Any accumulated rewards that haven&apos;t been claimed yet remain safe on your ID and can be claimed at any time. Your ID stays active regardless of when you claim.
              </p>
            </div>
          </GlassCard>
        );
      })()}

      {/* Allocation Breakdown */}
      <AllocationBreakdown depositAmount={isConnected && registered ? activeDepositNum : 0} />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Deposit USDT", href: "/invest", icon: Zap, primary: true },
          { label: "Claim Rewards", href: "/invest", icon: TrendingUp },
          { label: "Referral Tree", href: "/referrals", icon: Users },
          { label: "Ranks", href: "/ranks", icon: Activity },
        ].map((action) => (
          <Link key={action.label} href={action.href}>
            <GlassCard
              className={`p-4 cursor-pointer h-full flex flex-col items-center justify-center gap-2 ${
                action.primary ? "border-oslo-ice/30 ice-glow-pulse" : ""
              }`}
              hover
            >
              <action.icon
                className={`w-5 h-5 ${
                  action.primary ? "text-oslo-ice" : "text-oslo-text-secondary"
                }`}
              />
              <span className="text-xs font-medium text-oslo-text-primary text-center">
                {action.label}
              </span>
            </GlassCard>
          </Link>
        ))}
      </div>

      {/* Active Deposits */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-oslo-text-primary">
            Active Deposits
          </h2>
          {isConnected && (
            <Link href="/invest">
              <IceButton size="sm" variant="ghost">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </IceButton>
            </Link>
          )}
        </div>

        {!isConnected ? (
          <p className="text-sm text-oslo-text-muted py-8 text-center">
            Connect your wallet to view your deposits
          </p>
        ) : !hasDeposits ? (
          <div className="text-center py-12">
            <Zap className="w-10 h-10 text-oslo-text-muted mx-auto mb-3" />
            <p className="text-sm text-oslo-text-secondary mb-4">
              No active deposits yet
            </p>
            <Link href="/invest">
              <IceButton>Make Your First Deposit</IceButton>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-oslo-text-muted uppercase tracking-wider border-b border-white/5">
                  <th className="text-left py-3 px-3">Tier</th>
                  <th className="text-right py-3 px-3">Amount</th>
                  <th className="text-right py-3 px-3 hidden md:table-cell">Daily Rate</th>
                  <th className="text-right py-3 px-3 hidden md:table-cell">3X Cap</th>
                  <th className="text-right py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {hasDeposits && (
                  <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 px-3">
                      <TierBadge tier={tier || 1} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      ${formatToken(activeDeposit || 0n, 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-oslo-text-secondary hidden md:table-cell">
                      {(formatRate(dailyRate))}
                    </td>
                    <td className="py-3 px-3 text-right hidden md:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <ProgressRing progress={0} size={28} strokeWidth={3} showLabel={false} />
                        <span className="font-mono text-xs text-oslo-text-muted">
                          {RETURN_CAP_MULTIPLIER}X
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-oslo-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-oslo-success" />
                        Active
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Recent Activity */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-oslo-text-muted" />
          <h2 className="text-lg font-medium text-oslo-text-primary">
            Recent Activity
          </h2>
        </div>
        <div className="space-y-3">
          {!isConnected ? (
            <p className="text-sm text-oslo-text-muted py-4 text-center">
              Connect wallet to see your recent activity
            </p>
          ) : (
            <p className="text-sm text-oslo-text-muted py-4 text-center">
              Activity feed will appear here after your first transaction
            </p>
          )}
        </div>
      </GlassCard>

      {/* Level Yield Income */}
      {isConnected && registered && (() => {
        const levelIncomeArr = allLevelIncome?.data as bigint[] | undefined;
        const unlockedLvls = Number(unlockedLevels?.data || 0);
        const totalLevelYield = levelIncomeArr?.[0] || 0n;
        const totalLevelYieldNum = Number(totalLevelYield) / 1e18;

        return (
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-oslo-ice" />
                <h2 className="text-lg font-medium text-oslo-text-primary">
                  Level Yield Income
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-oslo-success">
                  Total: ${formatNumber(totalLevelYieldNum, 2)}
                </span>
                <Link href="/referrals">
                  <IceButton size="sm" variant="ghost">
                    Details <ArrowRight className="w-3 h-3 ml-1" />
                  </IceButton>
                </Link>
              </div>
            </div>

            <p className="text-xs text-oslo-text-muted mb-4">
              Yield earned from team members&apos; profit claims, distributed level-wise
            </p>

            {/* Level grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => {
                const isUnlocked = level <= unlockedLvls;
                const rateEntry = Object.entries(REFERRAL_COMMISSION_RATES).find(([key]) => {
                  if (key === '1') return level === 1;
                  if (key === '2') return level === 2;
                  if (key === '3-10') return level >= 3 && level <= 10;
                  if (key === '11-20') return level >= 11 && level <= 20;
                  return false;
                });
                const rate = rateEntry ? rateEntry[1] : { pct: 0 };
                const levelEarned = levelIncomeArr?.[level] || 0n;
                const earnedNum = Number(levelEarned) / 1e18;

                return (
                  <div
                    key={level}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                      isUnlocked
                        ? 'bg-white/[0.03] border-white/10'
                        : 'bg-white/[0.01] border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isUnlocked
                            ? 'bg-oslo-ice/20 text-oslo-ice'
                            : 'bg-white/5 text-oslo-text-muted'
                        }`}
                      >
                        {level}
                      </span>
                      <span className={`text-xs ${isUnlocked ? 'text-oslo-text-primary' : 'text-oslo-text-muted'}`}>
                        {rate.pct}%
                      </span>
                    </div>
                    <span className={`text-xs font-mono ${earnedNum > 0 ? 'text-oslo-success' : 'text-oslo-text-muted'}`}>
                      ${formatNumber(earnedNum, 2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 rounded-lg bg-oslo-ice/5 border border-oslo-ice/10">
              <p className="text-[11px] text-oslo-text-secondary">
                <strong className="text-oslo-ice">How it works:</strong> When your downline claims yield, a percentage is distributed to you based on the level commission rate.
                Level 1 = 30%, Level 2 = 20%, Levels 3-10 = 10%, Levels 11-20 = 5%.
              </p>
            </div>
          </GlassCard>
        );
      })()}
    </div>
  );
}

