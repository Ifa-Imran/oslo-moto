"use client";

import { useAccount, useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";
import { useMemo } from "react";
import { levelIncomeSystemABI, investmentEngineABI, CONTRACTS } from "@/lib/contracts";

/**
 * Tracks "today's" claims and level income using contract cumulative totals
 * and localStorage baselines. On the first visit of a new day, the baseline
 * is set to the current total, so "today" starts at 0. As the user claims
 * or earns commissions, the difference is shown.
 */
export function useTodayStats() {
  const { address } = useAccount();

  // Read total claimed from InvestmentEngine
  const { data: totalClaimed, refetch: refetchClaimed } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalClaimed",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  // Read total commissions earned from LevelIncomeSystem
  const { data: totalCommissions, refetch: refetchCommissions } = useReadContract({
    address: CONTRACTS.LEVEL_INCOME_SYSTEM,
    abi: levelIncomeSystemABI,
    functionName: "totalCommissionsEarned",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  const { todayClaim, todayLevelIncome } = useMemo(() => {
    if (!address || typeof window === "undefined") {
      return { todayClaim: 0n, todayLevelIncome: 0n };
    }

    const now = new Date();
    const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

    // --- Today's Claim ---
    const claimBaselineKey = `oslo_claim_baseline_${address}`;
    const claimDateKey = `oslo_claim_date_${address}`;
    const storedClaimDate = localStorage.getItem(claimDateKey);
    const currentClaimTotal = totalClaimed ?? 0n;
    let claimBaseline: bigint;

    if (storedClaimDate !== todayKey) {
      claimBaseline = currentClaimTotal;
      localStorage.setItem(claimBaselineKey, claimBaseline.toString());
      localStorage.setItem(claimDateKey, todayKey);
    } else {
      const stored = localStorage.getItem(claimBaselineKey);
      claimBaseline = stored ? BigInt(stored) : currentClaimTotal;
      if (!stored) {
        localStorage.setItem(claimBaselineKey, claimBaseline.toString());
      }
    }

    // --- Today's Level Income ---
    const commissionBaselineKey = `oslo_commission_baseline_${address}`;
    const commissionDateKey = `oslo_commission_date_${address}`;
    const storedCommissionDate = localStorage.getItem(commissionDateKey);
    const currentCommissionTotal = totalCommissions ?? 0n;
    let commissionBaseline: bigint;

    if (storedCommissionDate !== todayKey) {
      commissionBaseline = currentCommissionTotal;
      localStorage.setItem(commissionBaselineKey, commissionBaseline.toString());
      localStorage.setItem(commissionDateKey, todayKey);
    } else {
      const stored = localStorage.getItem(commissionBaselineKey);
      commissionBaseline = stored ? BigInt(stored) : currentCommissionTotal;
      if (!stored) {
        localStorage.setItem(commissionBaselineKey, commissionBaseline.toString());
      }
    }

    return {
      todayClaim: currentClaimTotal > claimBaseline ? currentClaimTotal - claimBaseline : 0n,
      todayLevelIncome:
        currentCommissionTotal > commissionBaseline
          ? currentCommissionTotal - commissionBaseline
          : 0n,
    };
  }, [address, totalClaimed, totalCommissions]);

  return {
    todayClaim,
    todayLevelIncome,
    totalClaimed: totalClaimed ?? 0n,
    totalCommissions: totalCommissions ?? 0n,
    refetchClaimed,
    refetchCommissions,
  };
}
