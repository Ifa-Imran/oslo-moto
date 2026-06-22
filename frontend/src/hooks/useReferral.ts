"use client";

import { useReadContract, useAccount } from "wagmi";
import { referralRegistryABI, investmentEngineABI, CONTRACTS } from "@/lib/contracts";

export function useReferral() {
  const { address } = useAccount();

  // Read direct referrer
  const { data: directReferrer } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "directReferrer",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read direct downlines
  const { data: directDownlines } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getDirectDownlines",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read direct downline count
  const { data: downlineCount } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getDirectDownlineCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read total team size (all levels)
  const { data: teamSize } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "getTeamSize",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Generate referral link
  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/stake?ref=${address}`
    : "";

  return {
    directReferrer,
    directDownlines,
    downlineCount,
    teamSize,
    referralLink,
  };
}
