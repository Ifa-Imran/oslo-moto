"use client";

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
import { leadershipBonusABI, CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";

export interface RankConfig {
  requiredTurnover: bigint;
  bonusRateBps: bigint;
}

export interface WeeklyStats {
  totalVolume: bigint;
  powerLegVolume: bigint;
  otherLegsVolume: bigint;
  powerLegAddress: string;
  rank: number;
}

export function useLeadershipBonus() {
  const { address } = useAccount();

  // Read current week
  const { data: currentWeek, refetch: refetchWeek } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "getCurrentWeek",
    chainId: bsc.id,
    query: { refetchInterval: 60000 },
  });

  // Read weekly cycle duration (1 week = 604800 seconds)
  const { data: weeklyCycleDuration } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "WEEKLY_CYCLE_DURATION",
    chainId: bsc.id,
  });

  // Read all rank configurations
  const { data: allRanks } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "getAllRanks",
    chainId: bsc.id,
  });

  // Read total bonus paid to user
  const { data: totalBonusPaid } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "totalBonusPaid",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read current week stats
  const currentWeekNum = currentWeek ? Number(currentWeek) : 0;
  const { data: currentWeekStats, refetch: refetchCurrentStats } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "getWeeklyStats",
    args: address && currentWeek ? [address, currentWeek] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address && !!currentWeek, refetchInterval: 30000 },
  });

  // Read last week stats (for claiming)
  const lastWeek = currentWeek ? currentWeek - 1n : 0n;
  const { data: lastWeekStats, refetch: refetchLastStats } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "getWeeklyStats",
    args: address && currentWeek ? [address, lastWeek] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address && !!currentWeek },
  });

  // Check if last week bonus was already claimed
  const { data: lastWeekClaimed } = useReadContract({
    address: CONTRACTS.LEADERSHIP_BONUS,
    abi: leadershipBonusABI,
    functionName: "bonusClaimed",
    args: address && currentWeek ? [address, lastWeek] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address && !!currentWeek },
  });

  // Claim weekly bonus
  const { writeContract: claimWrite, data: claimTxHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming } = useWaitForTransactionReceipt({ hash: claimTxHash });

  const claimWeeklyBonus = (week: bigint) => {
    claimWrite({
      address: CONTRACTS.LEADERSHIP_BONUS,
      abi: leadershipBonusABI,
      functionName: "claimWeeklyBonus",
      args: [week],
    });
  };

  // Parse rank configs
  const ranks: RankConfig[] = allRanks
    ? (allRanks as readonly { requiredTurnover: bigint; bonusRateBps: bigint }[]).map((r) => ({
        requiredTurnover: r.requiredTurnover,
        bonusRateBps: r.bonusRateBps,
      }))
    : [];

  // Parse current week stats
  const currentStats: WeeklyStats | null = currentWeekStats
    ? {
        totalVolume: (currentWeekStats as readonly bigint[])[0],
        powerLegVolume: (currentWeekStats as readonly bigint[])[1],
        otherLegsVolume: (currentWeekStats as readonly bigint[])[2],
        powerLegAddress: (currentWeekStats as readonly (string | bigint)[])[3] as string,
        rank: Number((currentWeekStats as readonly (string | bigint)[])[4]),
      }
    : null;

  // Parse last week stats
  const lastStats: WeeklyStats | null = lastWeekStats
    ? {
        totalVolume: (lastWeekStats as readonly bigint[])[0],
        powerLegVolume: (lastWeekStats as readonly bigint[])[1],
        otherLegsVolume: (lastWeekStats as readonly bigint[])[2],
        powerLegAddress: (lastWeekStats as readonly (string | bigint)[])[3] as string,
        rank: Number((lastWeekStats as readonly (string | bigint)[])[4]),
      }
    : null;

  return {
    currentWeek: currentWeekNum,
    currentWeekBig: currentWeek ?? 0n,
    weeklyCycleDuration: weeklyCycleDuration ?? 604800n,
    lastWeekBig: lastWeek,
    ranks,
    totalBonusPaid,
    currentStats,
    lastStats,
    lastWeekClaimed: lastWeekClaimed ?? false,
    claimWeeklyBonus,
    isClaiming: isClaiming || isClaimConfirming,
    refetchAll: () => {
      refetchWeek();
      refetchCurrentStats();
      refetchLastStats();
    },
  };
}
