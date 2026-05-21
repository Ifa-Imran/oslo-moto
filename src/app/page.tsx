"use client";

import { useState, useEffect, Suspense } from "react";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { parseEther, erc20Abi } from "viem";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { TierBadge } from "@/components/ui/TierBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { AddressChip } from "@/components/ui/AddressChip";
import { useInvestmentEngineReads } from "@/hooks/useInvestmentEngine";
import investmentEngineArtifact from "@/abis/OSLOInvestmentEngine.json";
const investmentEngineAbi = investmentEngineArtifact.abi;
import { useTokenReads, useBUSDReads, useMintBUSD } from "@/hooks/useToken";
import { useLiquidityManagerReads } from "@/hooks/useLiquidityManager";
import { useOSLODEX } from "@/hooks/useOSLODEX";
import { useReferralReads, useReferralWrites, useAirdropBalance, useClaimableAirdrop, useVestingInfo } from "@/hooks/useReferral";
import { useAppStore } from "@/store/useAppStore";
import { CONTRACTS } from "@/lib/contracts";
import { formatToken, formatNumber, formatCompact, truncateAddress } from "@/lib/utils";
import { TIER_DAILY_RATES, RETURN_CAP_MULTIPLIER, REGISTRATION_FEE, REGISTRATION_FEE_WEI, AIRDROP_TIERS, EARLY_ADOPTER_AIRDROP_THRESHOLD, AIRDROP_VESTING_THRESHOLD, AIRDROP_VESTING_RATE_PCT, AIRDROP_VESTING_INTERVAL, AIRDROP_FULL_VESTING_MONTHS, getCurrentPhase, getEffectiveRate, getPhaseLabel, LAUNCH_TIMESTAMP, LEVEL_UNLOCK_THRESHOLDS, REFERRAL_COMMISSION_RATES } from "@/lib/constants";
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
  ExternalLink,
} from "lucide-react";
import { type Address } from "viem";

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
  const { register, isLoading: isRegistering } = useReferralWrites();

  // Dashboard data (when registered)
  const { totalActiveDeposit, userTier, depositCount, totalDeposited, totalRewardsPaid, totalWithdrawn, launchTimestamp, completedCycles } =
    useInvestmentEngineReads(address);
  const { totalBurned, osloBalance, totalSupply } = useTokenReads(address);
  const { busdBalance } = useBUSDReads(address);
  const { mint, isLoading: isMinting, mintAmount } = useMintBUSD();

  // Liquidity pool data
  const { totalLiquidityAdded, totalBurnedViaSwap } = useLiquidityManagerReads();
  
  // OSLODEX price and reserves
  const { price: osloPrice, busdReserve, osloReserve } = useOSLODEX();

  // Locked airdrop balance (escrowed until first deposit)
  const { data: airdropBal } = useAirdropBalance(address);
  const { data: claimableBal } = useClaimableAirdrop(address);
  const { vestingStartTime, totalClaimed, registrationNumber } = useVestingInfo(address);

  // Pending ROI for first deposit
  const {
    data: pendingRewardsData,
    refetch: refetchPending,
  } = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getPendingRewards",
    args: address ? [address as Address, 0n] : undefined,
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

  // BUSD allowance check for referral contract (needed for $5 registration fee)
  const { data: busdAllowanceForReferral } = useReadContract({
    address: CONTRACTS.busd,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.referral] : undefined,
    query: { enabled: !!address },
  });

  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "registering">("idle");

  const registered = isRegistered.data as boolean | undefined;
  const tier = Number(userTier.data || 0);
  const activeDeposit = totalActiveDeposit.data as bigint | undefined;
  const depositNum = Number(depositCount.data || 0);

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
      // Step 1: Approve BUSD for referral contract if needed
      const currentAllowance = (busdAllowanceForReferral as bigint) || 0n;
      if (currentAllowance < REGISTRATION_FEE_WEI) {
        setFlowStep("approving");
        addToast({ title: "Approving BUSD for registration...", status: "pending" });

        const approveTx = await approveAsync({
          address: CONTRACTS.busd,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.referral, REGISTRATION_FEE_WEI],
        });

        addToast({
          title: "Approval Submitted",
          description: "Waiting for confirmation...",
          status: "pending",
          txHash: approveTx,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "BUSD Approved", status: "success", txHash: approveTx });
      }

      // Step 2: Register
      setFlowStep("registering");
      addToast({ title: "Registering...", status: "pending" });
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

  const handleMint = async () => {
    if (!address) return;
    try {
      addToast({ title: "Minting BUSD...", status: "pending" });
      const tx = await mint(address);
      addToast({ title: `${mintAmount} BUSD minted!`, status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Mint Failed",
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
              BNB Smart Chain Testnet
            </div>
            <h1 className="text-4xl md:text-6xl font-light tracking-tight text-oslo-text-primary leading-tight">
              OSLO Protocol
            </h1>
            <p className="mt-4 text-lg md:text-xl text-oslo-text-secondary max-w-2xl mx-auto font-light">
              A multi-tiered DeFi investment ecosystem. Stake BUSD, earn daily
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
                BSC Testnet supported via MetaMask, Trust Wallet, and WalletConnect.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Layers,
              title: "5-Tier Staking",
              desc: "Earn 2.50%–3.50% daily returns based on your deposit tier, up to 3X cap.",
            },
            {
              icon: Users,
              title: "20-Level Referrals",
              desc: "Build a network across 20 levels with commission rates up to 30%.",
            },
            {
              icon: Gift,
              title: "Weekly Rank Bonuses",
              desc: "7 competitive ranks from Bronze to Grandmaster with weekly BUSD bonuses.",
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
            Verified on BSC Testnet ·{" "}
            <a
              href={`https://testnet.bscscan.com/address/${CONTRACTS.investmentEngine}`}
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

  // ─── STATE 2: Connected, Not Registered ─────────────────────────────
  if (registered === false) {
    const myRef = referrer.data as string | undefined;
    const busdBal = busdBalance.data as bigint | undefined;
    const totalReg = Number((totalRegistered.data as bigint) || 0n);
    const isFirstUser = totalReg === 0;

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Welcome to OSLO</h1>
          <p className="mt-1 text-sm text-oslo-text-secondary">
            Register to access the full platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registration Form */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-oslo-ice" />
              <h2 className="text-lg font-medium">Register</h2>
            </div>

            <p className="text-sm text-oslo-text-secondary mb-4">
              You need to register before you can deposit, earn yields, or build
              your referral network. A <span className="text-oslo-ice font-medium">$5 BUSD fee</span> is required.
            </p>

            {/* Registration fee info */}
            <div className="mb-4 p-3 rounded-lg bg-oslo-ice/5 border border-oslo-ice/10">
              <p className="text-xs text-oslo-text-muted uppercase tracking-wider mb-1">
                Registration Fee
              </p>
              <p className="text-sm font-mono text-oslo-ice">${REGISTRATION_FEE}.00 BUSD</p>
              <p className="text-[10px] text-oslo-text-muted mt-1">
                Destination: 98% auto-liquidity · 2% protocol treasury
              </p>
              <p className="text-[10px] text-oslo-text-muted mt-0.5">
                First {EARLY_ADOPTER_AIRDROP_THRESHOLD.toLocaleString()} registrants receive OSLO airdrop — up to 10,000 OSLO!
              </p>
            </div>

            {/* Current wallet */}
            <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-xs text-oslo-text-muted uppercase tracking-wider mb-1">
                Your Wallet
              </p>
              <AddressChip address={address!} />
            </div>

            {/* Referrer input */}
            <div className="mb-4">
              <label className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider">
                Referrer Address
              </label>
              {isFirstUser ? (
                <div className="mt-1.5 p-3 rounded-lg bg-oslo-success/5 border border-oslo-success/20">
                  <p className="text-sm text-oslo-success flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    You&apos;re the first user — no referrer required
                  </p>
                  <p className="text-xs text-oslo-text-muted mt-1">
                    As the root user, you&apos;ll be the top of the referral tree. Start inviting others to earn commissions.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={referrerInput}
                    onChange={(e) => setReferrerInput(e.target.value)}
                    placeholder="0x... (from referral link)"
                    className="mt-1.5 w-full bg-oslo-void border border-white/10 rounded-btn px-4 py-2.5 text-sm font-mono text-oslo-text-primary placeholder:text-oslo-text-muted focus:outline-none focus:border-oslo-ice/50 transition-all"
                  />
                  {refParam ? (
                    <p className="text-[10px] text-oslo-ice mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Referrer detected from invite link
                    </p>
                  ) : (
                    <p className="text-[10px] text-oslo-text-muted mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Enter a valid referrer address or paste a referral link
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Register button */}
            <IceButton
              onClick={handleRegister}
              disabled={(!isFirstUser && !referrerInput) || isRegistering || flowStep !== "idle"}
              loading={isRegistering || flowStep !== "idle"}
              className="w-full"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {(() => {
                if (flowStep === "approving") return "Approving BUSD...";
                if (flowStep === "registering") return "Registering...";
                if (isFirstUser) return `Register as Root User — $${REGISTRATION_FEE} Fee`;
                return `Register Now — $${REGISTRATION_FEE} Fee`;
              })()}
            </IceButton>

            {myRef && myRef !== "0x0000000000000000000000000000000000000000" && (
              <p className="text-xs text-oslo-text-muted text-center mt-3">
                You are already registered with referrer:{" "}
                <span className="text-oslo-text-secondary font-mono">
                  {truncateAddress(myRef, 6)}
                </span>
              </p>
            )}
          </GlassCard>

          {/* Test Token Mint + Info */}
          <div className="space-y-4">
            <GlassCard>
              <div className="flex items-center gap-2 mb-4">
                <Coins className="w-5 h-5 text-oslo-warning" />
                <h2 className="text-lg font-medium">Test Tokens</h2>
              </div>

              <p className="text-sm text-oslo-text-secondary mb-4">
                Mint {mintAmount} test BUSD to try out deposits, referrals, and
                all OSLO Protocol features on BSC Testnet.
              </p>

              <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-xs text-oslo-text-muted uppercase tracking-wider mb-1">
                  Your BUSD Balance
                </p>
                <p className="text-2xl font-mono font-light text-oslo-text-primary">
                  ${busdBal != null ? formatToken(busdBal, 2) : "0.00"}
                </p>
              </div>

              <IceButton
                onClick={handleMint}
                disabled={isMinting}
                loading={isMinting}
                variant="secondary"
                className="w-full"
              >
                <Coins className="w-4 h-4 mr-2" />
                Mint {mintAmount} Test BUSD
              </IceButton>

              <p className="text-[10px] text-oslo-text-muted mt-3 text-center">
                No real value — BSC Testnet only. You can mint multiple times.
              </p>
            </GlassCard>

            {/* Quick guide */}
            <GlassCard>
              <h3 className="text-sm font-medium mb-3">Getting Started</h3>
              <div className="space-y-2">
                {[
                  "1. Mint test BUSD tokens",
                  "2. Register with referrer ($5 fee)",
                  "3. Go to Invest to deposit",
                  "4. Earn daily yields + referral commissions",
                ].map((step) => (
                  <p key={step} className="text-xs text-oslo-text-secondary flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-oslo-text-muted flex-shrink-0" />
                    {step}
                  </p>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    );
  }

  // ─── STATE 2.5: Loading registration status ─────────────────────────
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

  // ─── STATE 3: Registered — Dashboard ─────────────────────────────────
  // registered === true at this point
  const currentPhase = getCurrentPhase();
  const cycleNum = Number(completedCycles?.data || 0);
  const effectiveRate = getEffectiveRate(tier || 1, cycleNum);
  const totalReg = Number((totalRegistered.data as bigint) || 0n);

  // Pending ROI calculation
  const pendingTuple = pendingRewardsData as [bigint, bigint] | undefined;
  const pendingInv = pendingTuple?.[0] || 0n;
  const pendingProfit = pendingTuple?.[1] || 0n;
  const pendingTotal = pendingInv + pendingProfit;
  const busdBal = busdBalance.data as bigint | undefined;
  const osloBal = osloBalance.data as bigint | undefined;

  // Airdrop info for current user
  const userRegNum = Number((registrationNumber?.data as bigint) || 0n);
  const airdropTier = userRegNum > 0 && userRegNum <= EARLY_ADOPTER_AIRDROP_THRESHOLD
    ? AIRDROP_TIERS.find(t => userRegNum <= t.maxReg) || AIRDROP_TIERS[AIRDROP_TIERS.length - 1]
    : null;

  // Extract sponsor income from userInfo (referrer, unlockedLevels, totalEarned, registered)
  const userInfo = userInfoData?.data as [string, bigint, bigint, boolean] | undefined;
  const sponsorIncome = userInfo ? userInfo[2] : 0n;
  const directReferralsData = directReferrals?.data as string[] | undefined;
  const directReferralsCount = directReferralsData ? directReferralsData.length : 0;

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
            {getPhaseLabel(currentPhase)}
          </span>
          {cycleNum > 0 && (
            <span className="text-xs text-oslo-aurora bg-oslo-aurora/10 px-2 py-0.5 rounded-full">
              Cycle {cycleNum} · {effectiveRate / 100}% cap
            </span>
          )}
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
          value={`$${formatToken(totalLiquidityAdded?.data as bigint || 0n, 2)}`}
          subValue={totalRegistered.data != null ? `${String(totalRegistered.data)} users registered` : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Your Portfolio"
          value={isConnected && activeDeposit != null ? `$${formatToken(activeDeposit, 0)}` : "$0.00"}
          subValue={isConnected ? `BUSD: $${busdBal != null ? formatToken(busdBal, 0) : "0"} · OSLO: ${osloBal != null ? formatToken(osloBal, 0) : "0"}` : undefined}
          icon={<Wallet className="w-4 h-4" />}
        />
        <StatCard
          label="Pending Yield"
          value={`$${formatToken(pendingTotal, 2)}`}
          subValue="Accruing in real-time"
          icon={<Coins className="w-4 h-4" />}
        />
        <StatCard
          label="Your Tier"
          value={tier ? `Tier ${tier}` : "—"}
          subValue={`${(effectiveRate / 100).toFixed(2)}% daily · ${RETURN_CAP_MULTIPLIER}X cap`}
          icon={<Layers className="w-4 h-4" />}
        />
        <StatCard
          label="Liquidity Pool"
          value={`$${formatToken(totalLiquidityAdded?.data as bigint || 0n, 2)}`}
          subValue={`OSLO Price: $${parseFloat(osloPrice).toFixed(6)}`}
          icon={<Droplets className="w-4 h-4" />}
        />
        <StatCard
          label="DEX Reserves"
          value={`${formatCompact(busdReserve)} BUSD`}
          subValue={`${formatCompact(osloReserve)} OSLO`}
          icon={<Activity className="w-4 h-4" />}
        />
        <StatCard
          label="Airdrop Balance"
          value={(() => {
            const bal = airdropBal as bigint | undefined;
            const totalAirdrop = bal ? bal + ((totalClaimed?.data as bigint) || 0n) : ((totalClaimed?.data as bigint) || 0n);
            console.log('Airdrop Debug - airdropBal:', bal, 'totalClaimed:', totalClaimed?.data, 'totalAirdrop:', totalAirdrop, 'userRegNum:', userRegNum, 'isRegistered:', registered);
            
            // Show balance if it exists, regardless of tier calculation
            if (totalAirdrop > 0n) {
              return `${formatToken(totalAirdrop, 0)} OSLO`;
            }
            
            // User is registered but balance not loaded yet
            if (registered && userRegNum > 0) {
              return 'Loading...';
            }
            
            // Check if user might be eligible based on registration number
            if (airdropTier) {
              return 'Pending...';
            }
            
            return 'Not Eligible';
          })()}
          subValue={(() => {
            if (userRegNum > 0 && airdropTier) {
              return `Tier ${AIRDROP_TIERS.indexOf(airdropTier) + 1} · Registration #${userRegNum.toLocaleString()}`;
            }
            if (userRegNum > 0) {
              return `Registration #${userRegNum.toLocaleString()}`;
            }
            return 'Register to qualify';
          })()}
          icon={<Gift className="w-4 h-4" />}
        />
      </div>

      {/* Airdrop status — locked, vesting, or released */}
      {airdropTier && (
        (() => {
          const lockedBal = airdropBal as bigint | undefined;
          const clBal = claimableBal as bigint | undefined;
          const airdropReleased = osloBal != null && osloBal > 0n;
          const hasActiveDeposit = activeDeposit != null && activeDeposit > 0n;
          const vestStart = (vestingStartTime?.data as bigint | undefined) ?? 0n;
          const claimedTotal = (totalClaimed?.data as bigint | undefined) ?? 0n;
          const regNum = (registrationNumber?.data as bigint | undefined) ?? 0n;
          const isVesting = regNum > 0n && regNum <= BigInt(AIRDROP_VESTING_THRESHOLD);

          // Total airdrop amount = locked + claimed
          const totalAirdrop = lockedBal != null ? lockedBal + claimedTotal : claimedTotal;
          const vestedPct = totalAirdrop > 0n ? Number((claimedTotal * 10000n) / totalAirdrop) / 100 : 0;

          // How many months elapsed since vesting started
          const vestSecs = vestStart > 0n ? Number(Math.floor(Date.now() / 1000)) - Number(vestStart) : 0;
          const elapsedMonths = vestSecs > 0 ? Math.floor(vestSecs / AIRDROP_VESTING_INTERVAL) : 0;
          const expectedPct = isVesting ? Math.min(elapsedMonths * AIRDROP_VESTING_RATE_PCT, 100) : 100;

          // Show vesting progress for first 150 registrants
          if (isVesting && lockedBal != null && lockedBal > 0n && vestStart > 0n) {
            // Vesting active — show progress bar
            const claimNow = clBal ?? 0n;
            return (
              <div className="p-5 rounded-xl bg-oslo-ice/5 border border-oslo-ice/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-oslo-ice mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-oslo-ice">Airdrop Vesting</p>
                      <p className="text-xs text-oslo-text-secondary mt-0.5">
                        Registration #{Number(regNum).toLocaleString()} · Tier {AIRDROP_TIERS.indexOf(airdropTier) + 1} of 9 · {formatToken(totalAirdrop, 0)} OSLO total
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-oslo-ice bg-oslo-ice/10 px-2 py-0.5 rounded-full flex-shrink-0">
                    {vestedPct.toFixed(1)}% unlocked
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-oslo-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-oslo-ice to-oslo-ice/70 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(expectedPct, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-oslo-text-muted">
                  <span>Month {elapsedMonths} of {AIRDROP_FULL_VESTING_MONTHS}</span>
                  <span>{AIRDROP_VESTING_RATE_PCT}% monthly</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <p className="text-xs text-oslo-text-muted">Claimable now</p>
                    <p className="text-sm font-semibold text-oslo-success">{formatToken(claimNow, 2)} OSLO</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-oslo-text-muted">Total claimed</p>
                    <p className="text-sm font-semibold text-oslo-text-primary">{formatToken(claimedTotal, 2)} OSLO</p>
                  </div>
                </div>
              </div>
            );
          }

          // Vesting user but vesting hasn't started yet (no deposit made)
          if (isVesting && lockedBal != null && lockedBal > 0n && vestStart === 0n) {
            return (
              <div className="p-4 rounded-xl bg-oslo-warning/5 border border-oslo-warning/10 flex items-start gap-3">
                <Clock className="w-5 h-5 text-oslo-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-oslo-warning">Airdrop Locked — Vesting Pending</p>
                  <p className="text-xs text-oslo-text-secondary mt-0.5">
                    You earned {formatToken(lockedBal, 0)} OSLO as registration #{Number(regNum).toLocaleString()} (Vesting Tier). Make a deposit (min $10 BUSD) to start 1% monthly unlocking.
                  </p>
                  {!hasActiveDeposit && (
                    <Link href="/invest" className="inline-flex items-center gap-1 mt-2 text-xs text-oslo-ice hover:text-oslo-ice/80 transition-colors">
                      <Zap className="w-3 h-3" />
                      Go to Invest to start vesting
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          }

          // Non-vesting user: escrow still locked
          if (!isVesting && lockedBal != null && lockedBal > 0n) {
            return (
              <div className="p-4 rounded-xl bg-oslo-warning/5 border border-oslo-warning/10 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-oslo-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-oslo-warning">Airdrop Locked</p>
                  <p className="text-xs text-oslo-text-secondary mt-0.5">
                    You earned {formatToken(lockedBal, 0)} OSLO as registration #{Number(regNum).toLocaleString()}. Make a deposit (min $10 BUSD) to unlock and use your tokens.
                  </p>
                  {!hasActiveDeposit && (
                    <Link href="/invest" className="inline-flex items-center gap-1 mt-2 text-xs text-oslo-ice hover:text-oslo-ice/80 transition-colors">
                      <Zap className="w-3 h-3" />
                      Go to Invest to unlock your airdrop
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          }

          if (airdropReleased) {
            // Already released
            return (
              <div className="p-4 rounded-xl bg-oslo-success/5 border border-oslo-success/10 flex items-start gap-3">
                <Gift className="w-5 h-5 text-oslo-success mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-oslo-success">Airdrop Released!</p>
                  <p className="text-xs text-oslo-text-secondary mt-0.5">
                    You received {formatToken(osloBal, 0)} OSLO as registration #{Number(regNum).toLocaleString()} — Tier {AIRDROP_TIERS.indexOf(airdropTier) + 1} of 9
                    ({airdropTier.coins.toLocaleString()} OSLO reward).
                  </p>
                </div>
              </div>
            );
          }

          // Registered but no airdrop yet (should not normally happen if within threshold)
          return null;
        })()
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Deposit BUSD", href: "/invest", icon: Zap, primary: true },
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
        ) : depositNum === 0 ? (
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
                {depositNum > 0 && (
                  <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 px-3">
                      <TierBadge tier={tier || 1} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      ${formatToken(activeDeposit || 0n, 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-oslo-text-secondary hidden md:table-cell">
                      {(effectiveRate / 100).toFixed(2)}%
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
                  if (key === '11-15') return level >= 11 && level <= 15;
                  if (key === '16-20') return level >= 16 && level <= 20;
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
                Level 1 = 30%, Level 2 = 20%, Levels 3-10 = 1%, Levels 11-15 = 0.5%, Levels 16-20 = 0.25%.
              </p>
            </div>
          </GlassCard>
        );
      })()}
    </div>
  );
}

