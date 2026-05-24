import { CONTRACTS } from "@/lib/contracts";
import tokenArtifact from "@/abis/OSLOToken.json";
const tokenAbi = tokenArtifact.abi;
import mockUSDTArtifact from "@/abis/MockUSDT.json";
const mockUSDTAbi = mockUSDTArtifact.abi;
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { type Address, erc20Abi as standardErc20Abi, parseEther } from "viem";

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

// ─── MockUSDT Mint (Testnet only) ───────────────────────────────────
const MINT_AMOUNT = parseEther("10000"); // 10,000 USDT

export function useMintUSDT() {
  const { writeContractAsync, isPending } = useWriteContract();

  const mint = async (to: Address) => {
    return writeContractAsync({
      address: CONTRACTS.usdt,
      abi: mockUSDTAbi,
      functionName: "mint",
      args: [to, MINT_AMOUNT],
    });
  };

  return { mint, isLoading: isPending, mintAmount: "10,000" };
}
