"use client";

import { useState, useEffect } from "react";
import { useDEX } from "@/hooks/useDEX";
import { useAccount } from "wagmi";
import { formatPrice, formatOSLO, formatUSDT } from "@/lib/utils/format";
import toast from "react-hot-toast";

export function SellInterface() {
  const { address } = useAccount();
  const [osloAmount, setOsloAmount] = useState("");
  const [step, setStep] = useState<"input" | "approve" | "sell">("input");
  
  const {
    price,
    osloBalance,
    approveOsloForDex,
    sellOslo,
    isApproving,
    isApproveSuccess,
    isSelling,
    isSellSuccess,
    approveError,
    sellError,
    resetApprove,
    resetSell,
  } = useDEX();

  const estimatedUsdt = price && osloAmount && Number(osloAmount) > 0
    ? (BigInt(Math.floor(Number(osloAmount) * 1e18)) * price) / BigInt(1e18)
    : 0n;
  const tax = estimatedUsdt / 10n;
  const afterTax = estimatedUsdt - tax;

  // Derive effective step - auto-advance to "sell" once approval confirms on-chain
  const effectiveStep = isApproveSuccess && step === "approve" ? "sell" : step;

  // Show toast on approve error
  useEffect(() => {
    if (approveError) {
      toast.error(`Approval failed: ${approveError.message?.slice(0, 100) || "Unknown error"}`, {
        duration: 8000,
      });
      const timer = setTimeout(() => resetApprove(), 8000);
      return () => clearTimeout(timer);
    }
  }, [approveError, resetApprove]);

  // Show toast on sell success and reset state after a brief delay
  useEffect(() => {
    if (isSellSuccess) {
      toast.success("OSLO sold successfully! USDT sent to your wallet (10% tax deducted).", {
        duration: 6000,
        icon: "✅",
      });
      // Reset state asynchronously to avoid cascading renders
      const resetTimer = setTimeout(() => {
        setOsloAmount("");
        setStep("input");
      }, 100);
      const clearTimer = setTimeout(() => resetSell(), 6000);
      return () => {
        clearTimeout(resetTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [isSellSuccess, resetSell]);

  // Show toast on sell error
  useEffect(() => {
    if (sellError) {
      toast.error(`Sell failed: ${sellError.message?.slice(0, 100) || "Unknown error"}`, {
        duration: 8000,
      });
      const timer = setTimeout(() => resetSell(), 8000);
      return () => clearTimeout(timer);
    }
  }, [sellError, resetSell]);

  if (!address) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Sell OSLO</h3>
        <p className="text-slate-500">Connect your wallet to sell</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900">Sell OSLO</h3>
        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">Sell Only DEX</span>
      </div>

      <div className="space-y-4">
        {/* Balance */}
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Your OSLO Balance</span>
          <span className="text-slate-900">{formatOSLO(osloBalance)} OSLO</span>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm text-slate-500 mb-2">OSLO Amount</label>
          <div className="relative">
            <input
              type="number"
              value={osloAmount}
              onChange={(e) => {
                setOsloAmount(e.target.value);
                // Reset to input step if user changes amount
                if (step !== "input") {
                  setStep("input");
                  resetApprove();
                  resetSell();
                }
              }}
              placeholder="0.00"
              className="w-full bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none pr-16"
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
        <div className="space-y-2 bg-slate-100 rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Current Price</span>
            <span className="text-slate-900">${formatPrice(price)} /OSLO</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Gross USDT</span>
            <span className="text-slate-900">${formatUSDT(estimatedUsdt)}</span>
          </div>
          <div className="flex justify-between text-red-600 font-medium">
            <span>10% Tax (stays in LP)</span>
            <span>-${formatUSDT(tax)}</span>
          </div>
          <div className="border-t border-slate-300 pt-2 flex justify-between font-bold">
            <span className="text-slate-600">You Receive (after 10% tax)</span>
            <span className="text-green-600">${formatUSDT(afterTax)} USDT</span>
          </div>
        </div>

        {/* Burn Info */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
          50% of your OSLO will be burned, 50% retained in DEX. This increases the price floor.
        </div>

        {/* Success message for sell */}
        {isSellSuccess && (
          <div className="bg-green-50 border border-green-300 p-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-green-700 font-medium">
              Sold! You received ${formatUSDT(afterTax)} USDT (10% tax deducted).
            </p>
          </div>
        )}

        {/* Error message for sell */}
        {sellError && (
          <div className="bg-red-50 border border-red-300 p-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-700 font-medium">
              Sell failed. Please try again.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {effectiveStep === "input" && (
            <button
              onClick={() => setStep("approve")}
              disabled={!osloAmount || Number(osloAmount) <= 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Sell OSLO
            </button>
          )}
          {effectiveStep === "approve" && (
            <>
              <button
                onClick={() => approveOsloForDex(osloAmount)}
                disabled={isApproving}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {isApproving ? "Approving..." : "Step 1: Approve OSLO"}
              </button>
              <p className="text-xs text-slate-400 text-center">
                Waiting for approval confirmation before you can sell...
              </p>
            </>
          )}
          {effectiveStep === "sell" && (
            <button
              onClick={() => sellOslo(osloAmount)}
              disabled={isSelling}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isSelling ? "Selling..." : `Step 2: Sell for $${formatUSDT(afterTax)} USDT`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
