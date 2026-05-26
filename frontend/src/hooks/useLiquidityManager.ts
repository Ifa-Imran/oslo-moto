import { CONTRACTS } from "@/lib/contracts";
import liquidityManagerAbi from "@/abis/OSLOLiquidityManager.json";
import { useReadContract, useWatchContractEvent } from "wagmi";

export function useLiquidityManagerReads() {
  const totalLiquidityAdded = useReadContract({
    address: CONTRACTS.liquidityManager,
    abi: liquidityManagerAbi,
    functionName: "totalLiquidityAdded",
  });

  return { totalLiquidityAdded };
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
    eventName: "TokensRescued",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
