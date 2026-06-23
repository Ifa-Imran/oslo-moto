"use client";

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
import { useEffect } from "react";
import { parseUnits } from "viem";
import { osloDexABI, osloTokenABI, usdtABI, CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";

export function useDEX() {
  const { address } = useAccount();

  // Read OSLO price
  const { data: price, refetch: refetchPrice } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "getPrice",
    chainId: bsc.id,
    query: { refetchInterval: 15000 },
  });

  // Read total burned
  const { data: totalBurned } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "totalBurned",
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  // Read burn cap
  const { data: burnCap } = useReadContract({
    address: CONTRACTS.OSLO_DEX,
    abi: osloDexABI,
    functionName: "BURN_CAP",
    chainId: bsc.id,
  });

  // Read ACTUAL USDT balance of the DEX contract (includes registration fees, staking deposits, sell taxes)
  // This is the same as what the dashboard shows — must stay in sync
  const { data: usdtReserve } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "balanceOf",
    args: [CONTRACTS.OSLO_DEX],
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  // Read ACTUAL OSLO balance of the DEX contract (matches what getPrice uses)
  const { data: osloReserve } = useReadContract({
    address: CONTRACTS.OSLO_TOKEN,
    abi: osloTokenABI,
    functionName: "balanceOf",
    args: [CONTRACTS.OSLO_DEX],
    chainId: bsc.id,
    query: { refetchInterval: 30000 },
  });

  // Read user OSLO balance
  const { data: osloBalance } = useReadContract({
    address: CONTRACTS.OSLO_TOKEN,
    abi: osloTokenABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  // Approve OSLO for DEX
  const { writeContract: approveOslo, data: approveTxHash, isPending: isApproving, error: approveWriteError, reset: resetApprove } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess, error: approveConfirmError } = useWaitForTransactionReceipt({ hash: approveTxHash, chainId: bsc.id });

  // Sell OSLO
  const { writeContract: sellWrite, data: sellTxHash, isPending: isSelling, error: sellWriteError, reset: resetSell } = useWriteContract();
  const { isLoading: isSellConfirming, isSuccess: isSellSuccess, error: sellConfirmError } = useWaitForTransactionReceipt({ hash: sellTxHash, chainId: bsc.id });

  // Refetch price after sell success
  useEffect(() => {
    if (isSellSuccess) {
      refetchPrice();
    }
  }, [isSellSuccess, refetchPrice]);

  const approveOsloForDex = (amount: string) => {
    approveOslo({
      address: CONTRACTS.OSLO_TOKEN,
      abi: osloTokenABI,
      functionName: "approve",
      args: [CONTRACTS.OSLO_DEX, parseUnits(amount, 18)],
    });
  };

  const sellOslo = (amount: string) => {
    sellWrite({
      address: CONTRACTS.OSLO_DEX,
      abi: osloDexABI,
      functionName: "sellOslo",
      args: [parseUnits(amount, 18)],
    });
  };

  return {
    price,
    totalBurned,
    burnCap,
    usdtReserve,
    osloReserve,
    osloBalance,
    approveOsloForDex,
    sellOslo,
    isApproving: isApproving || isApproveConfirming,
    isApproveSuccess,
    isSelling: isSelling || isSellConfirming,
    isSellSuccess,
    approveError: approveWriteError || approveConfirmError,
    sellError: sellWriteError || sellConfirmError,
    resetApprove,
    resetSell,
    refetchPrice,
  };
}
