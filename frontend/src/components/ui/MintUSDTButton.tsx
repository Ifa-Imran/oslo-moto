"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { CONTRACTS } from "@/lib/contracts";
import { Coins } from "lucide-react";

const MOCK_USDT_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const MINT_AMOUNT = parseEther("10000"); // 10,000 USDT

export function MintUSDTButton() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [minted, setMinted] = useState(false);

  const handleMint = () => {
    if (!address) return;
    writeContract({
      address: CONTRACTS.usdt,
      abi: MOCK_USDT_ABI,
      functionName: "mint",
      args: [address, MINT_AMOUNT],
    });
  };

  // Show success briefly
  if (isSuccess && !minted) {
    setMinted(true);
    setTimeout(() => setMinted(false), 3000);
  }

  if (!isConnected) return null;

  return (
    <button
      onClick={handleMint}
      disabled={isPending || isConfirming}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oslo-success/10 border border-oslo-success/30 text-xs font-medium text-oslo-success hover:bg-oslo-success/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      title="Mint 10,000 Test USDT to your wallet"
    >
      {isPending || isConfirming ? (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <Coins className="w-3.5 h-3.5" />
      )}
      {minted ? "Minted!" : isPending ? "Confirm..." : isConfirming ? "Minting..." : "Faucet"}
    </button>
  );
}
