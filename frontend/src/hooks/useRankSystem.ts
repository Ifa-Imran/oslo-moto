import { CONTRACTS } from "@/lib/contracts";
import rankSystemArtifact from "@/abis/OSLORankSystem.json";
const rankSystemAbi = rankSystemArtifact.abi;
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address } from "viem";

export function useRankSystemReads(userAddress?: Address) {
  const enabled = !!userAddress;

  const currentWeekId = useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "getCurrentWeekId",
  });

  const currentRank = useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "getCurrentRank",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const pendingBonus = useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "getPendingBonus",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const bonusPoolBalance = useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "bonusPoolBalance",
  });

  const totalBonusesDistributed = useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "totalBonusesDistributed",
  });

  return { currentWeekId, currentRank, pendingBonus, bonusPoolBalance, totalBonusesDistributed };
}

export function useWeeklyTurnover(userAddress?: Address, weekId?: number) {
  return useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "getWeeklyTurnover",
    args: userAddress && weekId !== undefined ? [userAddress, BigInt(weekId)] : undefined,
    query: { enabled: !!userAddress && weekId !== undefined },
  });
}

export function useLegTurnover(userAddress?: Address, weekId?: number, legAddress?: Address) {
  return useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "getLegTurnover",
    args: userAddress && weekId !== undefined && legAddress
      ? [userAddress, BigInt(weekId), legAddress]
      : undefined,
    query: { enabled: !!userAddress && weekId !== undefined && !!legAddress },
  });
}

export function useIsRankQualified(userAddress?: Address) {
  return useReadContract({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    functionName: "isRankQualified",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });
}

export function useRankSystemWrites() {
  const { writeContractAsync, ...claimWrite } = useWriteContract();

  const claimRankBonus = async () => {
    return writeContractAsync({
      address: CONTRACTS.rankSystem,
      abi: rankSystemAbi,
      functionName: "claimRankBonus",
    });
  };

  return { claimRankBonus, isLoading: claimWrite.isPending };
}

export function useRankEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    eventName: "RankAchieved",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.rankSystem,
    abi: rankSystemAbi,
    eventName: "RankBonusClaimed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
