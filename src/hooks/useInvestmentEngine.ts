import { CONTRACTS } from "@/lib/contracts";
import investmentEngineArtifact from "@/abis/OSLOInvestmentEngine.json";

const investmentEngineAbi = investmentEngineArtifact.abi;
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

  const isInTrial = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "isInTrialPeriod",
    args: enabled ? [userAddress!, depositIndex!] : undefined,
    query: { enabled },
  });

  const trialTimeRemaining = useReadContract({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    functionName: "getTrialTimeRemaining",
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

  return { pendingRewards, isInTrial, trialTimeRemaining, depositData };
}

export function useInvestmentEngineWrites() {
  const { writeContractAsync, ...depositWrite } = useWriteContract();
  const { writeContractAsync: claimAsync, ...claimWrite } = useWriteContract();
  const { writeContractAsync: withdrawAsync, ...withdrawWrite } = useWriteContract();

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

  const withdrawPrincipal = async (depositIndex: number) => {
    return withdrawAsync({
      address: CONTRACTS.investmentEngine,
      abi: investmentEngineAbi,
      functionName: "withdrawPrincipal",
      args: [BigInt(depositIndex)],
    });
  };

  return {
    deposit,
    claimRewards,
    withdrawPrincipal,
    isLoading:
      depositWrite.isPending ||
      claimWrite.isPending ||
      withdrawWrite.isPending,
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

  useWatchContractEvent({
    address: CONTRACTS.investmentEngine,
    abi: investmentEngineAbi,
    eventName: "PrincipalWithdrawn",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

}
