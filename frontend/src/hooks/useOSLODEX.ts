/**
 * useOSLODEX - Custom hook for OSLODexV2 contract interactions (V3)
 * 
 * Provides functions for:
 * - Getting OSLO price from OSLODexV2
 * - Selling OSLO → USDT (sell only — USDT→OSLO is vault-restricted)
 * - Reading DEX reserves
 */
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import osloDEXABI from "@/abis/OSLODexV2.json";
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

  // Sell OSLO → USDT
  const { data: swapData, writeContract: sellOSLO, isPending: isSwapPending } = useWriteContract();

  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapData,
  });

  // Calculate USDT output for OSLO input (after 10% USD tax)
  const getEstimatedOutput = (inputAmount: string) => {
    const input = parseFloat(inputAmount);
    if (!input || !reserves) return 0;
    const usdtRes = parseFloat(usdtReserve);
    const osloRes = parseFloat(osloReserve);
    // AMM output: usdtOut = (osloAmount * usdtReserve) / (osloReserve + osloAmount)
    const grossUsdtOut = (input * usdtRes) / (osloRes + input);
    // 10% USD tax: user gets 90%
    return grossUsdtOut * 0.9;
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

  // Execute sell OSLO → USDT
  const handleSwapOSLOForUSDT = async (osloAmount: string) => {
    const amount = parseEther(osloAmount);
    const estimatedOutput = getEstimatedOutput(osloAmount);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toFixed(18));

    sellOSLO({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "sellOSLO",
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
