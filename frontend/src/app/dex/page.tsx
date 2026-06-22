"use client";

import { SellInterface } from "@/components/dex/SellInterface";
import { useDEX } from "@/hooks/useDEX";
import { formatOSLO, formatUSDT, formatPrice } from "@/lib/utils/format";

export default function DexPage() {
  const { price, totalBurned, burnCap, usdtReserve, osloReserve } = useDEX();

  const burnProgress = totalBurned && burnCap ? Number((totalBurned * 100n) / burnCap) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">DEX</h1>
        <p className="text-gray-400 mt-1">Sell OSLO for USDT on our one-way deflationary DEX</p>
      </div>

      {/* DEX Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">OSLO Price</p>
          <p className="text-xl font-bold text-blue-400">${formatPrice(price)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">USDT Liquidity</p>
          <p className="text-xl font-bold text-white">${formatUSDT(usdtReserve)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">OSLO Reserve</p>
          <p className="text-xl font-bold text-white">{formatOSLO(osloReserve)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Total Burned</p>
          <p className="text-xl font-bold text-red-400">{formatOSLO(totalBurned)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Burn Progress</p>
          <p className="text-xl font-bold text-orange-400">{burnProgress.toFixed(2)}%</p>
          <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${burnProgress}%` }} />
          </div>
        </div>
      </div>

      {/* Sell Interface */}
      <div className="max-w-lg">
        <SellInterface />
      </div>

      {/* DEX Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">DEX Mechanics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-400">
          <div className="space-y-2">
            <p className="text-white font-medium">Deflationary Design</p>
            <p>Every sell burns 50% of the OSLO tokens and retains 50% in the DEX reserve. This permanently reduces supply.</p>
          </div>
          <div className="space-y-2">
            <p className="text-white font-medium">Price Floor</p>
            <p>Maximum burn: 9.99M OSLO (90% of supply). A minimum floor of 1.11M OSLO is preserved forever.</p>
          </div>
          <div className="space-y-2">
            <p className="text-white font-medium">10% Sell Tax</p>
            <p>All sell taxes stay in the USDT liquidity pool, increasing the backing per remaining token.</p>
          </div>
          <div className="space-y-2">
            <p className="text-white font-medium">No Buy Function</p>
            <p>OSLO can only be earned through staking yields and referral commissions. There is no buy function.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
