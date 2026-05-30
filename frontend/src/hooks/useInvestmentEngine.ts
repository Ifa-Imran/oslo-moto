import { CONTRACTS } from "@/lib/contracts";
import investmentEngineAbi from "@/abis/OSLOInvestmentEngine.json";

import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address } from "viem";

export function useInvestmentEngineReads(userAddress?: Address) {
  const totalActiveDeposit = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getActiveDeposit",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const userTier = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getUserTier",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const depositCount = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getDepositCount",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const totalDeposited = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "totalDeposited",
  });

  const totalRewardsPaid = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "totalRewardsPaid",
  });

  const depositsPaused = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "depositsPaused",
  });

  const launchTimestamp = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "launchTimestamp",
  });

  const completedCycles = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "completedCycles",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const totalWithdrawn = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "totalWithdrawn",
  });

  const dAppBalance = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getDAppBalance",
  });

  return {
    totalActiveDeposit,
    userTier,
    depositCount,
    totalDeposited,
    totalRewardsPaid,
    totalWithdrawn,
    depositsPaused,
    launchTimestamp,
    completedCycles,
    dAppBalance,
  };
}

export function useDepositRead(userAddress?: Address, depositIndex?: number) {
  const enabled = !!userAddress && depositIndex !== undefined && depositIndex >= 0;

  const pendingRewards = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getPendingRewards",
    args: enabled ? [userAddress!, depositIndex!] : undefined,
    query: { enabled },
  });

  const isInEarlyExit = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "isInEarlyExitPeriod",
    args: enabled ? [userAddress!, depositIndex!] : undefined,
    query: { enabled },
  });

  const earlyExitAmount = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getEarlyExitAmount",
    args: enabled ? [userAddress!, depositIndex!] : undefined,
    query: { enabled },
  });

  const depositData = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "userDeposits",
    args: enabled ? [userAddress!, depositIndex!] : undefined,
    query: { enabled },
  });

  return { pendingRewards, isInEarlyExit, earlyExitAmount, depositData };
}

export function useInvestmentEngineWrites() {
  const { writeContractAsync, ...depositWrite } = useWriteContract();
  const { writeContractAsync: claimAsync, ...claimWrite } = useWriteContract();
  const { writeContractAsync: earlyExitAsync, ...earlyExitWrite } = useWriteContract();
  const { writeContractAsync: partialExitAsync, ...partialExitWrite } = useWriteContract();

  const deposit = async (amount: bigint) => {
    return writeContractAsync({
      address: CONTRACTS.investmentEngine,
      abi: investmentEngineAbi,
      functionName: "deposit",
      args: [amount],
    });
  };

  const claimRewards = async (depositIndex: number) => {
    return claimAsync({
      address: CONTRACTS.investmentEngine,
      abi: investmentEngineAbi,
      functionName: "claimRewards",
      args: [BigInt(depositIndex)],
    });
  };

  const earlyExit = async (depositIndex: number) => {
    return earlyExitAsync({
      address: CONTRACTS.investmentEngine,
      abi: investmentEngineAbi,
      functionName: "earlyExit",
      args: [BigInt(depositIndex)],
    });
  };

  const partialEarlyExit = async (depositIndex: number, percentageBp: number) => {
    return partialExitAsync({
      address: CONTRACTS.investmentEngine,
      abi: investmentEngineAbi,
      functionName: "partialEarlyExit",
      args: [BigInt(depositIndex), BigInt(percentageBp)],
    });
  };

  return {
    deposit,
    claimRewards,
    earlyExit,
    partialEarlyExit,
    isLoading:
      depositWrite.isPending ||
      claimWrite.isPending ||
      earlyExitWrite.isPending ||
      partialExitWrite.isPending,
  };
}

export function useDepositEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    eventName: "Deposited",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    eventName: "RewardsClaimed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

}
