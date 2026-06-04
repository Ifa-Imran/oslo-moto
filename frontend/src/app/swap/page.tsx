"use client";

import { useAccount, useBalance, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import { useOSLODEX } from "@/hooks/useOSLODEX";
import { useState } from "react";
import { parseEther, erc20Abi } from "viem";
import { useAppStore } from "@/store/useAppStore";

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { addToast } = useAppStore();
  const {
    price,
    usdtReserve,
    osloReserve,
    swapInput,
    setSwapInput,
    slippage,
    setSlippage,
    handleSwapOSLOForUSDT,
    getEstimatedOutput,
    isSwapPending,
    isSwapConfirming,
    isSwapConfirmed,
  } = useOSLODEX();

  const { data: osloBal } = useBalance({
    address,
    token: CONTRACTS.osloToken as `0x${string}`,
  });

  // OSLO allowance check for DEX
  const { data: osloAllowance } = useReadContract({
    address: CONTRACTS.osloToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.osloDEX] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync: approveAsync } = useWriteContract();

  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "swapping">("idle");
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  const estimatedOutput = getEstimatedOutput(swapInput);
  
  const handleMax = () => {
    if (osloBal) {
      setSwapInput(osloBal.formatted);
    }
  };

  const handleSwap = async () => {
    if (!swapInput || parseFloat(swapInput) <= 0 || !address || !publicClient) return;
    const osloAmountWei = parseEther(swapInput);
    const currentAllowance = (osloAllowance as bigint) || 0n;

    try {
      // ── Step 1: Approve OSLO if needed ──────────────────────────
      if (currentAllowance < osloAmountWei) {
        setFlowStep("approving");
        addToast({ title: "Approving OSLO for DEX...", status: "pending" });
        const approveTx = await approveAsync({
          address: CONTRACTS.osloToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.osloDEX, osloAmountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        addToast({ title: "OSLO Approved", status: "success", txHash: approveTx });
      }

      // ── Step 2: Swap ───────────────────────────────────────────
      setFlowStep("swapping");
      await handleSwapOSLOForUSDT(swapInput);
      setFlowStep("idle");
    } catch (err: any) {
      setFlowStep("idle");
      if (err?.message?.includes("rejected") || err?.message?.includes("denied")) return;
      addToast({
        title: "Swap Failed",
        description: err?.message?.slice(0, 120) || "Unknown error",
        status: "error",
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-oslo-void flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400">Connect your wallet to access the OSLO DEX</p>
        </div>
      </div>
    );
  }

  // Helpers: truncate long decimals for display
  const fmtBalance = (raw: string | undefined) => {
    if (!raw) return "0";
    const n = parseFloat(raw);
    if (isNaN(n)) return "0";
    if (n === 0) return "0";
    // Show up to 4 decimals on mobile, 6 on desktop
    return n < 0.0001 ? "<0.0001" : n.toFixed(n >= 1 ? 2 : 6);
  };
  const fmtPrice = (raw: string) => {
    const n = parseFloat(raw);
    if (isNaN(n)) return "0";
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
  };

  return (
    <div className="min-h-screen bg-oslo-void py-8 sm:py-12 px-3 sm:px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            OSLO DEX
          </h1>
          <p className="text-sm sm:text-base text-gray-400">Sell OSLO for USDT at the protocol-controlled exchange rate</p>
        </div>

        {/* Price Display */}
        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs sm:text-sm text-gray-400 mb-1">OSLO Price</p>
              <p className="text-lg sm:text-2xl font-bold text-white truncate">{fmtPrice(price)} USDT</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">USDT Reserve</p>
              <p className="text-base sm:text-xl font-semibold text-blue-300">{parseFloat(usdtReserve).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">OSLO Reserve</p>
              <p className="text-base sm:text-xl font-semibold text-purple-300">{parseFloat(osloReserve).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>

        {/* Swap Card */}
        <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 backdrop-blur-xl border border-blue-500/40 rounded-3xl p-5 sm:p-8 shadow-2xl">
          {/* Input Section */}
          <div className="mb-4">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <label className="text-xs sm:text-sm text-gray-300 font-medium">From</label>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-gray-400 max-w-[140px] sm:max-w-[200px] truncate">
                  Bal: {fmtBalance(osloBal?.formatted)}
                </span>
                <button
                  onClick={handleMax}
                  className="text-xs px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 rounded text-blue-300 transition-all flex-shrink-0"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="bg-blue-950/50 border border-blue-500/30 rounded-xl p-3 sm:p-4">
              <input
                type="number"
                value={swapInput}
                onChange={(e) => setSwapInput(e.target.value)}
                placeholder="0.0"
                className="w-full bg-transparent text-white text-xl sm:text-2xl font-semibold outline-none placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="flex items-center gap-2 mt-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                  O
                </div>
                <span className="text-white font-semibold text-sm sm:text-base">OSLO</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-2 relative z-10">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-800/80 border border-purple-500/40 flex items-center justify-center text-purple-300 text-lg">
              ↓
            </div>
          </div>

          {/* Fee Breakdown — only visible when input > 0 */}
          {swapInput && parseFloat(swapInput) > 0 && (() => {
            const inputOSLO = parseFloat(swapInput);
            const toBurn = inputOSLO * 0.5;         // 50% of tokens burned
            const toLP = inputOSLO * 0.5;           // 50% added to OSLO reserve (LP)
            const usdtTax = estimatedOutput * 0.1;  // 10% USD tax (stays in pool)
            const userReceives = estimatedOutput;   // Already 90% (getEstimatedOutput applies tax)
            return (
              <div className="mb-4 mt-1 px-3 sm:px-4 py-3 bg-red-900/20 border border-red-500/20 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-gray-400">You sell (OSLO)</span>
                  <span className="text-white font-mono font-semibold">{inputOSLO.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </div>
                <div className="border-t border-red-500/20" />
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-red-400">Burned (50%)</span>
                  <span className="text-red-400 font-mono">-{toBurn.toLocaleString(undefined, { maximumFractionDigits: 4 })} OSLO</span>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-green-400">Added to LP (50%)</span>
                  <span className="text-green-400 font-mono">+{toLP.toLocaleString(undefined, { maximumFractionDigits: 4 })} OSLO</span>
                </div>
                <div className="border-t border-red-500/20" />
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-yellow-400">USDT sell tax (10%)</span>
                  <span className="text-yellow-400 font-mono">stays in pool</span>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-blue-300 font-medium">You receive (90%)</span>
                  <span className="text-blue-300 font-mono font-semibold">{userReceives.toFixed(4)} USDT</span>
                </div>
              </div>
            );
          })()}

          {/* Arrow 2 */}
          {swapInput && parseFloat(swapInput) > 0 && (
            <div className="flex justify-center -my-2 relative z-10">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-800/80 border border-purple-500/40 flex items-center justify-center text-purple-300 text-lg">
                ↓
              </div>
            </div>
          )}

          {/* Output Section */}
          <div className="mb-5 sm:mb-6 mt-1">
            <label className="text-xs sm:text-sm text-gray-300 font-medium mb-2 block">To (estimated)</label>
            <div className="bg-purple-950/50 border border-purple-500/30 rounded-xl p-3 sm:p-4">
              <div className="text-xl sm:text-2xl font-semibold text-purple-300 truncate">
                {estimatedOutput > 0 ? estimatedOutput.toFixed(6) : "0.0"}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                  U
                </div>
                <span className="text-white font-semibold text-sm sm:text-base">USDT</span>
              </div>
            </div>
          </div>

          {/* Slippage Settings */}
          <div className="mb-6">
            <button
              onClick={() => setShowSlippageSettings(!showSlippageSettings)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ⚙️ Slippage Tolerance: {slippage}%
            </button>
            {showSlippageSettings && (
              <div className="mt-3 flex gap-2">
                {[0.5, 1, 2, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      slippage === s
                        ? "bg-blue-600 text-white"
                        : "bg-blue-900/30 text-gray-400 hover:bg-blue-900/50"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Allowance indicator */}
          {swapInput && parseFloat(swapInput) > 0 && (
            <div className="flex items-center gap-2 text-xs mb-3">
              {(() => {
                const osloAmountWei = parseEther(swapInput);
                const allowance = (osloAllowance as bigint) || 0n;
                if (allowance >= osloAmountWei) {
                  return (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                      <span className="text-green-400">OSLO approved — ready to swap</span>
                    </>
                  );
                }
                return (
                  <>
                    <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                    <span className="text-yellow-400">Approval required — one-click sign below</span>
                  </>
                );
              })()}
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!swapInput || parseFloat(swapInput) <= 0 || isSwapPending || isSwapConfirming || flowStep !== "idle"}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              !swapInput || parseFloat(swapInput) <= 0 || isSwapPending || isSwapConfirming || flowStep !== "idle"
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            }`}
          >
            {(() => {
              if (!isConnected) return "Connect Wallet";
              if (flowStep === "approving") return "Approving OSLO...";
              if (flowStep === "swapping") return "Swapping...";
              if (isSwapPending) return "Waiting for Approval...";
              if (isSwapConfirming) return "Confirming...";
              if (isSwapConfirmed) return "✓ Success!";
              if (!swapInput || parseFloat(swapInput) <= 0) return "Enter Amount";
              const allowance = (osloAllowance as bigint) || 0n;
              if (allowance < parseEther(swapInput)) return "Approve & Swap";
              return "Swap";
            })()}
          </button>

          {/* Transaction Status */}
          {isSwapConfirmed && (
            <div className="mt-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg text-center">
              <p className="text-green-300 font-semibold">✓ Swap Successful!</p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-900/30 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-3">ℹ️ About OSLO DEX</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• <strong>Sell OSLO → USDT:</strong> Convert your OSLO tokens to USDT anytime</li>
            <li>• <strong>Protocol-Controlled Liquidity:</strong> All liquidity is managed by the OSLO protocol</li>
            <li>• <strong>Fair Pricing:</strong> AMM constant-product formula (xy=k)</li>
            <li>• <strong>Slippage Protection:</strong> Customizable slippage tolerance for every swap</li>
            <li>• <strong>10% USDT Tax:</strong> 10% of your USDT output stays in the pool as liquidity</li>
            <li>• <strong>Token Split:</strong> 50% of sold OSLO is burned, 50% added to DEX reserve (LP)</li>
            <li>• <strong>Deflation:</strong> 50% of every sell is permanently burned, driving up token price</li>
            <li>• <strong>Burn Cap:</strong> Burning stops when 90% of supply (9.99M OSLO) is burned; 1.11M OSLO remain</li>
            <li>• <strong>Buy OSLO:</strong> OSLO is earned through yield on your staked USDT — not purchasable directly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
