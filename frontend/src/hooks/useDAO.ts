import { CONTRACTS } from "@/lib/contracts";
import daoAbi from "@/abis/OSLODAO.json";
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address } from "viem";

export function useDAOReads(userAddress?: Address) {
  const enabled = !!userAddress;

  const isDAOMember = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "isDAOMember",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const daoMemberCount = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "daoMemberCount",
  });

  const pendingRoyalty = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "getPendingRoyalty",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const royaltyPoolBalance = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "royaltyPoolBalance",
  });

  const currentMonthId = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "getCurrentMonthId",
  });

  const allDAOMembers = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "getAllDAOMembers",
  });

  const totalRoyaltiesDistributed = useReadContract({
    address: CONTRACTS.dao,
    abi: daoAbi,
    functionName: "totalRoyaltiesDistributed",
  });

  return {
    isDAOMember,
    daoMemberCount,
    pendingRoyalty,
    royaltyPoolBalance,
    currentMonthId,
    allDAOMembers,
    totalRoyaltiesDistributed,
  };
}

export function useDAOWrites() {
  const { writeContractAsync, ...claimWrite } = useWriteContract();

  const claimRoyalty = async () => {
    return writeContractAsync({
      address: CONTRACTS.dao,
      abi: daoAbi,
      functionName: "claimRoyalty",
    });
  };

  return { claimRoyalty, isLoading: claimWrite.isPending };
}

export function useDAOEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.dao,
    abi: daoAbi,
    eventName: "DAOMemberQualified",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.dao,
    abi: daoAbi,
    eventName: "RoyaltyClaimed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
