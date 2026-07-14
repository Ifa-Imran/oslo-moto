"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useReadContract,
  useWriteContract,
  useAccount,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits } from "viem";
import { investmentEngineABI, usdtABI, CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";

export function useStaking(
  amount: string = "",
  tier: number = 1,
  referrer: string = "0x0000000000000000000000000000000000000000"
) {
  const { address } = useAccount();
  const amountParsed = amount && !isNaN(Number(amount)) ? parseUnits(amount, 18) : 0n;

  // Ref to track whether we've already auto-staked for the current approval
  // This prevents double-staking from a single approval while allowing multiple stakes
  const autoStakedRef = useRef(false);

  // Read aggregated user stake (sums all stakes)
  const { data: userStake, refetch: refetchStake } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getUserStake",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read all individual stakes (for count + detailed display)
  const { data: userStakes, refetch: refetchStakes } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getUserStakes",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read accrued yield (aggregated across all stakes)
  const { data: accruedYield, refetch: refetchYield } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "calculateAccruedYield",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read claimable yield (aggregated across all stakes)
  const { data: claimableYield, refetch: refetchClaimable } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getClaimableYield",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read total claimed
  const { data: totalClaimed, refetch: refetchTotalClaimed } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "totalClaimed",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read whether user has ever staked (for referral link gating)
  const { data: hasStaked } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "hasStaked",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // Read remaining stake capacity (max $5,000 total per wallet)
  const { data: remainingCapacity, refetch: refetchRemaining } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "getRemainingStakeCapacity",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  // USDT balance & allowance
  const { data: usdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.INVESTMENT_ENGINE] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  const isApproved = allowance !== undefined && allowance >= amountParsed && amountParsed > 0n;

  // Approve USDT
  const {
    writeContract: approveUsdt,
    data: approveTxHash,
    isPending: isApproving,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveConfirmError,
  } = useWaitForTransactionReceipt({ hash: approveTxHash, chainId: bsc.id });

  // Stake
  const {
    writeContract: stakeWrite,
    data: stakeTxHash,
    isPending: isStaking,
    error: stakeError,
    reset: resetStake,
  } = useWriteContract();

  const {
    isLoading: isStakeConfirming,
    isSuccess: isStakeSuccess,
    error: stakeConfirmError,
  } = useWaitForTransactionReceipt({ hash: stakeTxHash, chainId: bsc.id });

  // Claim
  const { writeContract: claimWrite, data: claimTxHash, isPending: isClaiming, error: claimWriteError, reset: resetClaim } = useWriteContract();
  const {
    isLoading: isClaimConfirming,
    isSuccess: isClaimSuccess,
    error: claimConfirmError,
  } = useWaitForTransactionReceipt({
    hash: claimTxHash,
    chainId: bsc.id,
  });

  const executeStake = useCallback(() => {
    if (amountParsed === 0n) return;
    stakeWrite({
      address: CONTRACTS.INVESTMENT_ENGINE,
      abi: investmentEngineABI,
      functionName: "stake",
      args: [amountParsed, tier as number, referrer as `0x${string}`],
    });
  }, [amountParsed, tier, referrer, stakeWrite]);

  const approve = useCallback(() => {
    if (amountParsed === 0n) return;
    // Reset auto-stake tracking for this new approval flow
    autoStakedRef.current = false;
    // Reset previous stake state so success/error from prior stakes don't interfere
    resetStake();
    approveUsdt({
      address: CONTRACTS.USDT,
      abi: usdtABI,
      functionName: "approve",
      args: [CONTRACTS.INVESTMENT_ENGINE, amountParsed],
    });
  }, [amountParsed, approveUsdt, resetStake]);

  // Auto-trigger stake after approval confirms
  // Uses ref to prevent double-staking while allowing multiple stakes across different approvals
  useEffect(() => {
    if (
      isApproveSuccess &&
      amountParsed > 0n &&
      !isStaking &&
      !isStakeConfirming &&
      !autoStakedRef.current
    ) {
      autoStakedRef.current = true;
      executeStake();
    }
  }, [isApproveSuccess, amountParsed, isStaking, isStakeConfirming, executeStake]);

  // Refetch data after stake success
  useEffect(() => {
    if (isStakeSuccess) {
      refetchStake();
      refetchStakes();
      refetchYield();
      refetchAllowance();
      refetchRemaining();
    }
  }, [isStakeSuccess, refetchStake, refetchStakes, refetchYield, refetchAllowance, refetchRemaining]);

  // Refetch data after claim success
  useEffect(() => {
    if (isClaimSuccess) {
      refetchStake();
      refetchStakes();
      refetchYield();
      refetchTotalClaimed();
      refetchClaimable();
      refetchRemaining();
    }
  }, [isClaimSuccess, refetchStake, refetchStakes, refetchYield, refetchTotalClaimed, refetchClaimable, refetchRemaining]);

  const claimYield = () => {
    claimWrite({
      address: CONTRACTS.INVESTMENT_ENGINE,
      abi: investmentEngineABI,
      functionName: "claimYield",
    });
  };

  // Reset stake flow (call when user starts editing for a new stake)
  const resetStakeFlow = useCallback(() => {
    resetApprove();
    resetStake();
    autoStakedRef.current = false;
  }, [resetApprove, resetStake]);

  // Count active stakes
  const stakeCount = userStakes ? userStakes.length : 0;
  const activeStakeCount = userStakes
    ? userStakes.filter((s) => s.isActive).length
    : 0;

  return {
    userStake,
    userStakes,
    stakeCount,
    activeStakeCount,
    accruedYield,
    claimableYield,
    totalClaimed,
    hasStaked,
    usdtBalance,
    allowance,
    isApproved,
    approve,
    stake: executeStake,
    claimYield,
    isApproving: isApproving || isApproveConfirming,
    isStaking: isStaking || isStakeConfirming,
    isClaiming: isClaiming || isClaimConfirming,
    isStakeSuccess,
    isClaimSuccess,
    claimError: claimWriteError || claimConfirmError,
    resetClaim,
    approveError,
    approveConfirmError,
    stakeError,
    stakeConfirmError,
    remainingCapacity,
    refetchStake,
    refetchStakes,
    refetchYield,
    refetchRemaining,
    refetchTotalClaimed,
    refetchClaimable,
    resetStakeFlow,
  };
}
