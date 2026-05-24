/**
 * useOSLODEX - Custom hook for OSLODEX contract interactions
 * 
 * Provides functions for:
 * - Getting OSLO price from OSLODEX
 * - Swapping OSLO → USDT (sell only — USDT→OSLO is protocol-restricted)
 * - Reading OSLODEX reserves
 */
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import osloDEXArtifact from "@/abis/OSLODEX.json";
const osloDEXABI = osloDEXArtifact.abi;
import { parseEther, formatEther } from "viem";
import { useState } from "react";

export function useOSLODEX() {
  const [swapInput, setSwapInput] = useState("");
  const [slippage, setSlippage] = useState(1); // 1% default slippage

  // Read OSLO price
  const { data: price, refetch: refetchPrice } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXABI,
    functionName: "getPrice",
    query: { refetchInterval: 10000 },
  });

  // Read reserves
  const { data: reserves, refetch: refetchReserves } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXABI,
    functionName: "getReserves",
    query: { refetchInterval: 10000 },
  });

  const usdtReserve = reserves ? formatEther((reserves as [bigint, bigint])[0]) : "0";
  const osloReserve = reserves ? formatEther((reserves as [bigint, bigint])[1]) : "0";

  // Swap OSLO → USDT (sell only)
  const { data: swapData, writeContract: swapOSLOForUSDT, isPending: isSwapPending } = useWriteContract();

  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapData,
  });

  // Calculate USDT output for OSLO input (sell direction)
  const getEstimatedOutput = (inputAmount: string) => {
    const input = parseFloat(inputAmount);
    if (!input || !reserves) return 0;
    const usdtRes = parseFloat(usdtReserve);
    const osloRes = parseFloat(osloReserve);
    // OSLO → USDT: output = (input * usdtReserve) / (osloReserve + input)
    return (input * usdtRes) / (osloRes + input);
  };

  // Helper: convert USDT amount to estimated OSLO output (for display only)
  const getOSLOOutput = (usdtAmount: number) => {
    if (!usdtAmount || !reserves) return 0;
    const usdtRes = parseFloat(usdtReserve);
    const osloRes = parseFloat(osloReserve);
    if (usdtRes === 0 || osloRes === 0) return 0;
    // USDT → OSLO: output = (usdtAmount * osloReserve) / (usdtReserve + usdtAmount)
    return (usdtAmount * osloRes) / (usdtRes + usdtAmount);
  };

  // Execute swap OSLO → USDT
  const handleSwapOSLOForUSDT = async (osloAmount: string) => {
    const amount = parseEther(osloAmount);
    const estimatedOutput = getEstimatedOutput(osloAmount);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toString());

    swapOSLOForUSDT({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "swapOSLOForUSDT",
      args: [amount, minAmount],
    });
  };

  return {
    // State
    price: price ? formatEther(price as bigint) : "0",
    usdtReserve,
    osloReserve,
    swapInput,
    setSwapInput,
    slippage,
    setSlippage,
    
    // Actions
    handleSwapOSLOForUSDT,
    getEstimatedOutput,
    getOSLOOutput,
    refetchPrice,
    refetchReserves,
    
    // Status
    isSwapPending,
    isSwapConfirming,
    isSwapConfirmed,
  };
}
