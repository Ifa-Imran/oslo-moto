"use client";

import { useAccount, useBalance } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import { useOSLODEX } from "@/hooks/useOSLODEX";
import { useTokenReads } from "@/hooks/useToken";
import { useState } from "react";
import { parseEther } from "viem";

export default function SwapPage() {
  const { address, isConnected } = useAccount();
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

  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  const estimatedOutput = getEstimatedOutput(swapInput);
  
  const handleMax = () => {
    if (osloBal) {
      setSwapInput(osloBal.formatted);
    }
  };

  const handleSwap = async () => {
    if (!swapInput || parseFloat(swapInput) <= 0) return;
    await handleSwapOSLOForUSDT(swapInput);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-purple-950 to-indigo-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400">Connect your wallet to access the OSLO DEX</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-purple-950 to-indigo-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            OSLO DEX
          </h1>
          <p className="text-gray-400">Sell OSLO for USDT at the protocol-controlled exchange rate</p>
        </div>

        {/* Price Display */}
        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-400 mb-1">OSLO Price</p>
              <p className="text-2xl font-bold text-white">{parseFloat(price).toFixed(6)} USDT</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">USDT Reserve</p>
              <p className="text-xl font-semibold text-blue-300">{parseFloat(usdtReserve).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">OSLO Reserve</p>
              <p className="text-xl font-semibold text-purple-300">{parseFloat(osloReserve).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>

        {/* Swap Card */}
        <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 backdrop-blur-xl border border-blue-500/40 rounded-3xl p-8 shadow-2xl">
          {/* Input Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-300 font-medium">From</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">
                  Balance: {osloBal?.formatted || "0"}
                </span>
                <button
                  onClick={handleMax}
                  className="text-xs px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 rounded text-blue-300 transition-all"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="bg-blue-950/50 border border-blue-500/30 rounded-xl p-4">
              <input
                type="number"
                value={swapInput}
                onChange={(e) => setSwapInput(e.target.value)}
                placeholder="0.0"
                className="w-full bg-transparent text-white text-2xl font-semibold outline-none placeholder-gray-600"
              />
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  O
                </div>
                <span className="text-white font-semibold">
                  OSLO
                </span>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-300 font-medium">To (estimated)</label>
            </div>
            <div className="bg-purple-950/50 border border-purple-500/30 rounded-xl p-4">
              <div className="text-2xl font-semibold text-purple-300">
                {estimatedOutput > 0 ? estimatedOutput.toFixed(6) : "0.0"}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">
                  U
                </div>
                <span className="text-white font-semibold">
                  USDT
                </span>
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

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!swapInput || parseFloat(swapInput) <= 0 || isSwapPending || isSwapConfirming}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              !swapInput || parseFloat(swapInput) <= 0 || isSwapPending || isSwapConfirming
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            }`}
          >
            {isSwapPending ? "Waiting for Approval..." : isSwapConfirming ? "Confirming..." : isSwapConfirmed ? "✓ Success!" : "Swap"}
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
            <li>• <strong>Fair Pricing:</strong> Price = USDT Reserve / OSLO Reserve</li>
            <li>• <strong>Slippage Protection:</strong> Customizable slippage tolerance for every swap</li>
            <li>• <strong>10% Sell Fee:</strong> 10% fee → OSLO burned · USDT value stays in DEX as additional liquidity</li>
            <li>• <strong>Burn Cap:</strong> Burning stops when 90% of supply (9.99M OSLO) is burned; 1.11M OSLO remain</li>
            <li>• <strong>Buy OSLO:</strong> OSLO is earned through yield on your staked USDT — not purchasable directly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
