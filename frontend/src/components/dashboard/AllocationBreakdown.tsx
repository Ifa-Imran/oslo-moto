"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { formatNumber } from "@/lib/utils";
import { motion } from "framer-motion";
import { Droplets, Gift, Building2, TrendingUp, BarChart3 } from "lucide-react";

interface AllocationBreakdownProps {
  depositAmount: number | null; // in whole USDT (null if no deposit)
}

const ALLOCATIONS = [
  {
    label: "Liquidity Pool",
    pct: 98,
    desc: "Injected into OSLODEX for price stability and depth",
    icon: Droplets,
    color: "bg-oslo-ice",
    textColor: "text-oslo-ice",
    borderColor: "border-oslo-ice/20",
    bgColor: "bg-oslo-ice/5",
  },
  {
    label: "Reward Wallet",
    pct: 1,
    desc: "Distributed to active stakers as yield incentives",
    icon: Gift,
    color: "bg-oslo-success",
    textColor: "text-oslo-success",
    borderColor: "border-oslo-success/20",
    bgColor: "bg-oslo-success/5",
  },
  {
    label: "Company Support",
    pct: 0.5,
    desc: "Reserved for platform operations and development",
    icon: Building2,
    color: "bg-oslo-aurora",
    textColor: "text-oslo-aurora",
    borderColor: "border-oslo-aurora/20",
    bgColor: "bg-oslo-aurora/5",
  },
  {
    label: "Better Performance",
    pct: 0.5,
    desc: "Allocated for protocol upgrades and marketing",
    icon: TrendingUp,
    color: "bg-purple-500",
    textColor: "text-purple-400",
    borderColor: "border-purple-500/20",
    bgColor: "bg-purple-500/5",
  },
];

export function AllocationBreakdown({ depositAmount }: AllocationBreakdownProps) {
  const amount = depositAmount ?? 0;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-oslo-ice" />
        <h2 className="text-lg font-medium text-oslo-text-primary">
          Investment Allocation
        </h2>
        <span className="text-[10px] text-oslo-text-muted ml-auto">
          Applied on every deposit, re-investment, and re-stake
        </span>
      </div>

      {/* Visual bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-6">
        <motion.div
          className="bg-oslo-ice h-full"
          initial={{ width: 0 }}
          animate={{ width: "98%" }}
          transition={{ duration: 0.8, delay: 0.1 }}
        />
        <motion.div
          className="bg-oslo-success h-full"
          initial={{ width: 0 }}
          animate={{ width: "1%" }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
        <motion.div
          className="bg-oslo-aurora h-full"
          initial={{ width: 0 }}
          animate={{ width: "0.5%" }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <motion.div
          className="bg-purple-500 h-full"
          initial={{ width: 0 }}
          animate={{ width: "0.5%" }}
          transition={{ duration: 0.8, delay: 0.4 }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ALLOCATIONS.map((alloc, i) => (
          <motion.div
            key={alloc.label}
            className={`p-3 rounded-xl border ${alloc.borderColor} ${alloc.bgColor}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * (i + 1) }}
          >
            <div className="flex items-center gap-2 mb-2">
              <alloc.icon className={`w-3.5 h-3.5 ${alloc.textColor}`} />
              <span className={`text-[10px] uppercase tracking-wider ${alloc.textColor}`}>
                {alloc.pct}%
              </span>
            </div>
            <p className="text-xs font-medium text-oslo-text-primary mb-1">
              {alloc.label}
            </p>
            {amount > 0 && (
              <p className="text-[11px] font-mono text-oslo-text-secondary">
                ${formatNumber(amount * alloc.pct / 100, 2)} USDT
              </p>
            )}
            <p className="text-[9px] text-oslo-text-muted mt-1 leading-relaxed">
              {alloc.desc}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-[9px] text-oslo-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-oslo-ice" /> 98% Liquidity
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-oslo-success" /> 1% Rewards
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-oslo-aurora" /> 0.5% Company
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500" /> 0.5% Performance
        </span>
      </div>
    </GlassCard>
  );
}
