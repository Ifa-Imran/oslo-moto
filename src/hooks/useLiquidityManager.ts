import { CONTRACTS } from "@/lib/contracts";
import liquidityManagerArtifact from "@/abis/OSLOLiquidityManager.json";
const liquidityManagerAbi = liquidityManagerArtifact.abi;
import { useReadContract, useWatchContractEvent } from "wagmi";

export function useLiquidityManagerReads() {
  const totalLiquidityAdded = useReadContract({
    address: CONTRACTS.liquidityManager,
    abi: liquidityManagerAbi,
    functionName: "totalLiquidityAdded",
  });

  const totalBurnedViaSwap = useReadContract({
    address: CONTRACTS.liquidityManager,
    abi: liquidityManagerAbi,
    functionName: "totalBurnedViaSwap",
  });

  return { totalLiquidityAdded, totalBurnedViaSwap };
}

export function useLiquidityEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.liquidityManager,
    abi: liquidityManagerAbi,
    eventName: "LiquidityAdded",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.liquidityManager,
    abi: liquidityManagerAbi,
    eventName: "BuybackBurned",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
