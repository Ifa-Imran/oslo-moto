import { CONTRACTS } from "@/lib/contracts";
import referralAbi from "@/abis/OSLOReferral.json";
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address } from "viem";

export function useReferralReads(userAddress?: Address) {
  const enabled = !!userAddress;

  const isRegistered = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "isRegistered",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const referrer = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getReferrer",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const directReferrals = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getDirectReferrals",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const qualifiedDirects = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getQualifiedDirectsCount",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const unlockedLevels = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getUnlockedLevels",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const teamSize = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getTeamSize",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const referralRewards = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "referralRewards",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const totalRegistered = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "totalRegistered",
  });

  const totalCommissionsPaid = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "totalCommissionsPaid",
  });

  // userInfo returns (referrer, unlockedLevels, totalEarned, registered)
  const userInfoData = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "userInfo",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  // Per-level income (returns uint256[21]: index 0 = total, 1-20 = per-level)
  const allLevelIncome = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getAllLevelIncome",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  return {
    isRegistered,
    referrer,
    directReferrals,
    qualifiedDirects,
    unlockedLevels,
    teamSize,
    referralRewards,
    totalRegistered,
    totalCommissionsPaid,
    userInfoData,
    allLevelIncome,
  };
}

export function useAirdropBalance(userAddress?: Address) {
  return useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getAirdropBalance",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });
}

export function useClaimableAirdrop(userAddress?: Address) {
  return useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "getClaimableAirdrop",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });
}

export function useVestingInfo(userAddress?: Address) {
  const enabled = !!userAddress;

  const vestingStartTime = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "vestingStartTime",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const totalClaimed = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "totalClaimed",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  const registrationNumber = useReadContract({
    address: CONTRACTS.referral,
    abi: referralAbi,
    functionName: "registrationNumber",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });

  return { vestingStartTime, totalClaimed, registrationNumber };
}

export function useReferralWrites() {
  const { writeContractAsync, isPending } = useWriteContract();

  const register = async (user: Address, referrer: Address) => {
    return writeContractAsync({
      address: CONTRACTS.referral,
      abi: referralAbi,
      functionName: "register",
      args: [user, referrer],
    });
  };

  const claimReferralRewards = async () => {
    return writeContractAsync({
      address: CONTRACTS.referral,
      abi: referralAbi,
      functionName: "claimReferralRewards",
    });
  };

  const claimAirdrop = async () => {
    return writeContractAsync({
      address: CONTRACTS.referral,
      abi: referralAbi,
      functionName: "claimAirdrop",
    });
  };

  return {
    register,
    claimReferralRewards,
    claimAirdrop,
    isLoading: isPending,
  };
}

export function useReferralEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.referral,
    abi: referralAbi,
    eventName: "UserRegistered",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.referral,
    abi: referralAbi,
    eventName: "LevelUnlocked",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.referral,
    abi: referralAbi,
    eventName: "ReferralPaid",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });

  useWatchContractEvent({
    address: CONTRACTS.referral,
    abi: referralAbi,
    eventName: "ReferralRewardsClaimed",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
