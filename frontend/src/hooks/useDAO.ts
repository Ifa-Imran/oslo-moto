"use client";

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
import { osloDAOABI, referralRegistryABI, investmentEngineABI, CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";

export function useDAO() {
  const { address } = useAccount();

  // Read member info (for isQualified, slotNumber)
  const { data: memberData } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "members",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read qualified member count
  const { data: qualifiedCount } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "getQualifiedMemberCount",
  });

  // Read max members
  const { data: maxMembers } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "MAX_MEMBERS",
  });

  // Read total protocol turnover
  const { data: totalTurnover } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "totalProtocolTurnover",
  });

  // Read last distribution
  const { data: lastDistribution } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "lastDistribution",
  });

  // Read distribution cooldown
  const { data: distributionCooldown } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "DISTRIBUTION_COOLDOWN",
  });

  // Read real-time team size from ReferralRegistry (recursive count)
  const { data: realTeamSize } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getTeamSize",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read real-time team volume from InvestmentEngine (recursive sum)
  const { data: realTeamVolume } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getTeamVolume",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read real-time leg count from ReferralRegistry
  const { data: realLegCount } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getDirectDownlineCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Self-qualify for DAO membership
  const { writeContract: selfQualifyWrite, data: selfQualifyTxHash, isPending: isSelfQualifying } = useWriteContract();
  const { isLoading: isSelfQualifyConfirming, isSuccess: isSelfQualifySuccess } = useWaitForTransactionReceipt({
    hash: selfQualifyTxHash,
    chainId: bsc.id,
  });

  const selfQualify = () => {
    selfQualifyWrite({
      address: CONTRACTS.OSLO_DAO,
      abi: osloDAOABI,
      functionName: "selfQualify",
    });
  };

  // Claim individual royalty
  const { writeContract: claimRoyaltyWrite, data: claimRoyaltyTxHash, isPending: isClaimingRoyalty } = useWriteContract();
  const { isLoading: isClaimRoyaltyConfirming, isSuccess: isClaimRoyaltySuccess } = useWaitForTransactionReceipt({
    hash: claimRoyaltyTxHash,
    chainId: bsc.id,
  });

  const claimRoyalty = () => {
    claimRoyaltyWrite({
      address: CONTRACTS.OSLO_DAO,
      abi: osloDAOABI,
      functionName: "claimRoyalty",
    });
  };

  // Distribute royalties to all members (permissionless)
  const { writeContract: distributeWrite, data: distributeTxHash, isPending: isDistributing } = useWriteContract();
  const { isLoading: isDistributeConfirming, isSuccess: isDistributeSuccess } = useWaitForTransactionReceipt({
    hash: distributeTxHash,
    chainId: bsc.id,
  });

  const distributeRoyalties = () => {
    distributeWrite({
      address: CONTRACTS.OSLO_DAO,
      abi: osloDAOABI,
      functionName: "distributeRoyalties",
    });
  };

  // Read pending royalty for current user
  const { data: pendingRoyalty } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "getPendingRoyalty",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read if new cycle is available
  const { data: newCycleAvailable } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "isNewCycleAvailable",
  });

  // Read current cycle info
  const { data: currentCycle } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "currentCycle",
  });

  const { data: cyclePool } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "cyclePool",
  });

  const { data: cycleMemberCount } = useReadContract({
    address: CONTRACTS.OSLO_DAO,
    abi: osloDAOABI,
    functionName: "cycleMemberCount",
  });

  return {
    memberData,
    qualifiedCount,
    maxMembers,
    totalTurnover,
    lastDistribution,
    distributionCooldown,
    realTeamSize,
    realTeamVolume,
    realLegCount,
    selfQualify,
    isSelfQualifying: isSelfQualifying || isSelfQualifyConfirming,
    isSelfQualifySuccess,
    claimRoyalty,
    isClaimingRoyalty: isClaimingRoyalty || isClaimRoyaltyConfirming,
    isClaimRoyaltySuccess,
    distributeRoyalties,
    isDistributing: isDistributing || isDistributeConfirming,
    isDistributeSuccess,
    pendingRoyalty,
    newCycleAvailable,
    currentCycle,
    cyclePool,
    cycleMemberCount,
  };
}
