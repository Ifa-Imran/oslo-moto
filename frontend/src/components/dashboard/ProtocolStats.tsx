"use client";

import { useDEX } from "@/hooks/useDEX";
import { formatPrice, formatOSLO, formatUSDT } from "@/lib/utils/format";

export function ProtocolStats() {
  const { price, totalBurned, burnCap, usdtReserve, osloReserve } = useDEX();

  const burnProgress = totalBurned && burnCap
    ? Number((totalBurned * 100n) / burnCap)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="OSLO Price"
        value={`$${formatPrice(price)}`}
        subtitle="USDT per OSLO"
        color="blue"
      />
      <StatCard
        title="Total Burned"
        value={formatOSLO(totalBurned)}
        subtitle={`${burnProgress.toFixed(2)}% of cap`}
        color="red"
      />
      <StatCard
        title="DEX USDT Reserve"
        value={`$${formatUSDT(usdtReserve)}`}
        subtitle="Liquidity Pool"
        color="green"
      />
      <StatCard
        title="DEX OSLO Reserve"
        value={formatOSLO(osloReserve)}
        subtitle="Available for trading"
        color="purple"
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "blue" | "green" | "red" | "purple";
}) {
  const colorMap = {
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
    red: "border-red-200 bg-red-50",
    purple: "border-purple-200 bg-purple-50",
  };

  return (
    <div className={`border rounded-xl p-4 ${colorMap[color]}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}
