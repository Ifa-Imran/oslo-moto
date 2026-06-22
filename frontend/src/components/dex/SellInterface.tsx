"use client";

import { useState } from "react";
import { useDEX } from "@/hooks/useDEX";
import { useAccount } from "wagmi";
import { formatPrice, formatOSLO, formatUSDT } from "@/lib/utils/format";

export function SellInterface() {
  const { address } = useAccount();
  const [osloAmount, setOsloAmount] = useState("");
  const [step, setStep] = useState<"input" | "approve" | "sell">("input");
  
  const { price, osloBalance, approveOsloForDex, sellOslo, isApproving, isSelling } = useDEX();

  const estimatedUsdt = price && osloAmount && Number(osloAmount) > 0
    ? (BigInt(Math.floor(Number(osloAmount) * 1e18)) * price) / BigInt(1e18)
    : 0n;
  const tax = estimatedUsdt / 10n;
  const afterTax = estimatedUsdt - tax;

  if (!address) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Sell OSLO</h3>
        <p className="text-gray-400">Connect your wallet to sell</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Sell OSLO</h3>
        <span className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded">Sell Only DEX</span>
      </div>

      <div className="space-y-4">
        {/* Balance */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Your OSLO Balance</span>
          <span className="text-white">{formatOSLO(osloBalance)} OSLO</span>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">OSLO Amount</label>
          <div className="relative">
            <input
              type="number"
              value={osloAmount}
              onChange={(e) => setOsloAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none pr-16"
            />
            <button
              onClick={() => osloBalance && setOsloAmount((Number(osloBalance) / 1e18).toString())}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-blue-600 text-white px-2 py-1 rounded"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="space-y-2 bg-gray-800/50 rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Current Price</span>
            <span className="text-white">${formatPrice(price)} /OSLO</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Gross USDT</span>
            <span className="text-white">${formatUSDT(estimatedUsdt)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>10% Tax (stays in LP)</span>
            <span>-${formatUSDT(tax)}</span>
          </div>
          <div className="border-t border-gray-700 pt-2 flex justify-between font-bold">
            <span className="text-gray-300">You Receive</span>
            <span className="text-green-400">${formatUSDT(afterTax)} USDT</span>
          </div>
        </div>

        {/* Burn Info */}
        <div className="bg-orange-900/20 border border-orange-800/30 rounded-lg p-3 text-xs text-orange-300">
          50% of your OSLO will be burned, 50% retained in DEX. This increases the price floor.
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {step === "input" && (
            <button
              onClick={() => setStep("approve")}
              disabled={!osloAmount || Number(osloAmount) <= 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Sell OSLO
            </button>
          )}
          {step === "approve" && (
            <button
              onClick={() => { approveOsloForDex(osloAmount); setStep("sell"); }}
              disabled={isApproving}
              className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isApproving ? "Approving..." : "Step 1: Approve OSLO"}
            </button>
          )}
          {step === "sell" && (
            <button
              onClick={() => sellOslo(osloAmount)}
              disabled={isSelling}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isSelling ? "Selling..." : "Step 2: Confirm Sell"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
