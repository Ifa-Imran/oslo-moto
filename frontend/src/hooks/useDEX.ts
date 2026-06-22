"use client";

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
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
  const { writeContract: approveOslo, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Sell OSLO
  const { writeContract: sellWrite, data: sellTxHash, isPending: isSelling } = useWriteContract();
  const { isLoading: isSellConfirming } = useWaitForTransactionReceipt({ hash: sellTxHash });

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
    isSelling: isSelling || isSellConfirming,
    refetchPrice,
  };
}
