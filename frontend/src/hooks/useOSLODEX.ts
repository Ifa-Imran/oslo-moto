/**
 * useOSLODEX - Custom hook for OSLODEX contract interactions
 * 
 * Provides functions for:
 * - Getting OSLO price from OSLODEX
 * - Swapping USDT ↔ OSLO
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

  // Read OSLO price (live from getPrice)
  const { data: livePrice, refetch: refetchPrice } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXABI,
    functionName: "getPrice",
    query: { refetchInterval: 10000 }, // Refetch every 10 seconds
  });

  // Read lastPrice (fallback when DEX reserves are 0, e.g. after admin drain)
  const { data: lastPriceData } = useReadContract({
    address: CONTRACTS.osloDEX,
    abi: osloDEXABI,
    functionName: "lastPrice",
    query: { refetchInterval: 30000 },
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

  // Use live price from getPrice(); fall back to lastPrice when DEX reserves are empty
  const resolvedPrice: bigint =
    (livePrice as bigint) && (livePrice as bigint) > 0n
      ? (livePrice as bigint)
      : (lastPriceData as bigint) || 0n;

  // Swap USDT for OSLO
  const { data: swapUSDTData, writeContract: swapUSDTForOSLO, isPending: isSwapPending } = useWriteContract();

  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapUSDTData,
  });

  // Calculate output amount (frontend estimation)
  const getEstimatedOutput = (inputAmount: string, isUSDTInput: boolean) => {
    const input = parseFloat(inputAmount);
    if (!input || !reserves) return 0;

    const usdtRes = parseFloat(usdtReserve);
    const osloRes = parseFloat(osloReserve);

    if (isUSDTInput) {
      // USDT → OSLO: output = (input * osloReserve) / (usdtReserve + input)
      return (input * osloRes) / (usdtRes + input);
    } else {
      // OSLO → USDT: output = (input * usdtReserve) / (osloReserve + input)
      return (input * usdtRes) / (osloRes + input);
    }
  };

  // Execute swap USDT → OSLO
  const handleSwapUSDTForOSLO = async (usdtAmount: string) => {
    const amount = parseEther(usdtAmount);
    const estimatedOutput = getEstimatedOutput(usdtAmount, true);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toString());

    swapUSDTForOSLO({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "swapUSDTForOSLO",
      args: [amount, minAmount],
    });
  };

  // Execute swap OSLO → USDT
  const handleSwapOSLOForUSDT = async (osloAmount: string) => {
    const amount = parseEther(osloAmount);
    const estimatedOutput = getEstimatedOutput(osloAmount, false);
    const minOutput = estimatedOutput * (1 - slippage / 100);
    const minAmount = parseEther(minOutput.toString());

    swapUSDTForOSLO({
      address: CONTRACTS.osloDEX,
      abi: osloDEXABI,
      functionName: "swapOSLOForUSDT",
      args: [amount, minAmount],
    });
  };

  return {
    // State
    price: resolvedPrice > 0n ? formatEther(resolvedPrice) : "0",
    usdtReserve,
    osloReserve,
    swapInput,
    setSwapInput,
    slippage,
    setSlippage,
    
    // Actions
    handleSwapUSDTForOSLO,
    handleSwapOSLOForUSDT,
    getEstimatedOutput,
    refetchPrice,
    refetchReserves,
    
    // Status
    isSwapPending,
    isSwapConfirming,
    isSwapConfirmed,
  };
}
