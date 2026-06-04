import { CONTRACTS } from "@/lib/contracts";
import vaultAbi from "@/abis/OSLOVault.json";

import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address } from "viem";

export function useInvestmentEngineReads(userAddress?: Address) {
  const totalActiveDeposit = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "getActiveDeposit",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const userTier = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "getUserTier",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const totalDeposited = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "totalDeposited",
  });

  const totalRewardsPaid = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "totalRewardsPaid",
  });

  const depositsPaused = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "depositsPaused",
  });

  const launchTimestamp = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "launchTimestamp",
  });

  const totalWithdrawn = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "totalWithdrawn",
  });

  const combinedEarnings = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "getCombinedEarnings",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 15000 },
  });

  const pendingRewards = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "getPendingRewards",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 15000 },
  });

  const isInEarlyExit = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "isInEarlyExitPeriod",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const userPool = useReadContract({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    functionName: "getUserPool",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 15000 },
  });

  return {
    totalActiveDeposit,
    userTier,
    totalDeposited,
    totalRewardsPaid,
    totalWithdrawn,
    depositsPaused,
    launchTimestamp,
    combinedEarnings,
    pendingRewards,
    isInEarlyExit,
    userPool,
  };
}

export function useInvestmentEngineWrites() {
  const { writeContractAsync, ...depositWrite } = useWriteContract();
  const { writeContractAsync: claimAsync, ...claimWrite } = useWriteContract();
  const { writeContractAsync: earlyExitAsync, ...earlyExitWrite } = useWriteContract();
  const { writeContractAsync: partialExitAsync, ...partialExitWrite } = useWriteContract();

  const deposit = async (amount: bigint) => {
    return writeContractAsync({
      address: CONTRACTS.osloVault,
      abi: vaultAbi,
      functionName: "deposit",
      args: [amount],
    });
  };

  const claimRewards = async () => {
    return claimAsync({
      address: CONTRACTS.osloVault,
      abi: vaultAbi,
      functionName: "claimRewards",
      args: [],
    });
  };

  const earlyExit = async () => {
    return earlyExitAsync({
      address: CONTRACTS.osloVault,
      abi: vaultAbi,
      functionName: "earlyExit",
      args: [],
    });
  };

  const partialEarlyExit = async (percentageBp: number) => {
    return partialExitAsync({
      address: CONTRACTS.osloVault,
      abi: vaultAbi,
      functionName: "partialEarlyExit",
      args: [BigInt(percentageBp)],
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
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    eventName: "Deposited",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.osloVault,
    abi: vaultAbi,
    eventName: "RewardsClaimed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
