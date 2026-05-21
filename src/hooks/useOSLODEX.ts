/**
 * useOSLODEX - Custom hook for OSLODEX contract interactions
 * 
 * Provides functions for:
 * - Getting OSLO price from OSLODEX
 * - Swapping BUSD ↔ OSLO
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
    query: { refetchInterval: 10000 }, // Refetch every 10 seconds
  });

  // Read reserves
  const { data: reserves, refetch: refetchReserves } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXABI,
    functionName: "getReserves",
    query: { refetchInterval: 10000 },
  });

  const busdReserve = reserves ? formatEther((reserves as [bigint, bigint])[0]) : "0";
  const osloReserve = reserves ? formatEther((reserves as [bigint, bigint])[1]) : "0";

  // Swap BUSD for OSLO
  const { data: swapBUSDData, writeContract: swapBUSDForOSLO, isPending: isSwapPending } = useWriteContract();

  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapBUSDData,
  });

  // Calculate output amount (frontend estimation)
  const getEstimatedOutput = (inputAmount: string, isBUSDInput: boolean) => {
    const input = parseFloat(inputAmount);
    if (!input || !reserves) return 0;

    const busdRes = parseFloat(busdReserve);
    const osloRes = parseFloat(osloReserve);

    if (isBUSDInput) {
      // BUSD → OSLO: output = (input * osloReserve) / (busdReserve + input)
      return (input * osloRes) / (busdRes + input);
    } else {
      // OSLO → BUSD: output = (input * busdReserve) / (osloReserve + input)
      return (input * busdRes) / (osloRes + input);
    }
  };

  // Execute swap BUSD → OSLO
  const handleSwapBUSDForOSLO = async (busdAmount: string) => {
    const amount = parseEther(busdAmount);
    const estimatedOutput = getEstimatedOutput(busdAmount, true);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toString());

    swapBUSDForOSLO({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "swapBUSDForOSLO",
      args: [amount, minAmount],
    });
  };

  // Execute swap OSLO → BUSD
  const handleSwapOSLOForBUSD = async (osloAmount: string) => {
    const amount = parseEther(osloAmount);
    const estimatedOutput = getEstimatedOutput(osloAmount, false);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toString());

    swapBUSDForOSLO({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "swapOSLOForBUSD",
      args: [amount, minAmount],
    });
  };

  return {
    // State
    price: price ? formatEther(price as bigint) : "0",
    busdReserve,
    osloReserve,
    swapInput,
    setSwapInput,
    slippage,
    setSlippage,
    
    // Actions
    handleSwapBUSDForOSLO,
    handleSwapOSLOForBUSD,
    getEstimatedOutput,
    refetchPrice,
    refetchReserves,
    
    // Status
    isSwapPending,
    isSwapConfirming,
    isSwapConfirmed,
  };
}
