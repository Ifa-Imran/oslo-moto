import { CONTRACTS } from "@/lib/contracts";
import tokenAbi from "@/abis/OSLOToken.json";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { type Address, erc20Abi as standardErc20Abi } from "viem";

export function useTokenReads(userAddress?: Address) {
  const totalBurned = useReadContract({
    address: CONTRACTS.osloToken,
    abi: tokenAbi,
    functionName: "totalBurned",
  });

  const osloBalance = useReadContract({
    address: CONTRACTS.osloToken,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const totalSupply = useReadContract({
    address: CONTRACTS.osloToken,
    abi: tokenAbi,
    functionName: "totalSupply",
  });

  return { totalBurned, osloBalance, totalSupply };
}

export function useUSDTReads(userAddress?: Address) {
  // Use standard ERC20 ABI for USDT
  const usdtBalance = useReadContract({
    address: CONTRACTS.usdt,
    abi: standardErc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  return { usdtBalance };
}

export function useTokenEvents(onEvent?: (event: any) => void) {
  useWatchContractEvent({
    address: CONTRACTS.osloToken,
    abi: tokenAbi,
    eventName: "SellTaxApplied",
    onLogs: (logs) => logs.forEach((log) => onEvent?.(log)),
  });
}
