import { CONTRACTS } from "@/lib/contracts";
import treasuryArtifact from "@/abis/OSLOTreasury.json";
const treasuryAbi = treasuryArtifact.abi;
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";

export function useTreasuryReads() {
  const totalReceived = useReadContract({
    address: CONTRACTS.treasury,
    abi: treasuryAbi,
    functionName: "totalReceived",
  });

  const totalDistributed = useReadContract({
    address: CONTRACTS.treasury,
    abi: treasuryAbi,
    functionName: "totalDistributed",
  });

  const pendingDistribution = useReadContract({
    address: CONTRACTS.treasury,
    abi: treasuryAbi,
    functionName: "pendingDistribution",
  });

  return { totalReceived, totalDistributed, pendingDistribution };
}

export function useTreasuryWrites() {
  const { writeContractAsync, ...distributeWrite } = useWriteContract();

  const distribute = async () => {
    return writeContractAsync({
      address: CONTRACTS.treasury,
      abi: treasuryAbi,
      functionName: "distribute",
    });
  };

  return { distribute, isLoading: distributeWrite.isPending };
}

export function useTreasuryEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.treasury,
    abi: treasuryAbi,
    eventName: "FeesReceived",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.treasury,
    abi: treasuryAbi,
    eventName: "Distributed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
