"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatNumber } from "@/lib/utils";
import { motion } from "framer-motion";
import { Clock, Coins, TrendingUp, DollarSign } from "lucide-react";

interface RealTimeYieldProps {
  depositAmount: number;    // in whole USDT units
  dailyRate: number;        // percentage (e.g. 1.00)
  osloPrice: number;        // USDT per OSLO
  pendingUSDT: number;      // contract pending rewards in USDT
}

export function RealTimeYield({
  depositAmount,
  dailyRate,
  osloPrice,
  pendingUSDT,
}: RealTimeYieldProps) {
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  const dailyYieldUSDT = depositAmount * (dailyRate / 100);
  const perSecondUSDT = dailyYieldUSDT / 86400;
  const perMinuteUSDT = dailyYieldUSDT / 1440;
  const safePrice = osloPrice > 0 ? osloPrice : 0.000001;

  // Reset start time when pending changes (new block fetch)
  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsed(0);
  }, [pendingUSDT]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 250); // smooth 4 updates/sec
    return () => clearInterval(interval);
  }, []);

  const realTimeAddon = perSecondUSDT * elapsed;
  const totalPending = pendingUSDT + realTimeAddon;
  const totalPendingOSLO = totalPending / safePrice;
  const dailyYieldOSLO = dailyYieldUSDT / safePrice;
  const perMinuteOSLO = perMinuteUSDT / safePrice;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-oslo-success animate-pulse" />
        <Clock className="w-4 h-4 text-oslo-success" />
        <h2 className="text-lg font-medium text-oslo-text-primary">
          Live Yield Tracker
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Yield USDT */}
        <motion.div
          className="p-4 rounded-xl bg-oslo-ice/5 border border-oslo-ice/10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-oslo-ice" />
            <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
              Daily Yield
            </span>
          </div>
          <p className="text-lg font-mono font-light text-oslo-text-primary">
            ${formatNumber(dailyYieldUSDT, 4)}
          </p>
          <p className="text-xs text-oslo-ice mt-1">
            {formatNumber(dailyYieldOSLO, 2)} OSLO
          </p>
        </motion.div>

        {/* Per Minute USDT */}
        <motion.div
          className="p-4 rounded-xl bg-oslo-success/5 border border-oslo-success/10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-oslo-success" />
            <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
              Per Minute
            </span>
          </div>
          <p className="text-lg font-mono font-light text-oslo-text-primary">
            ${formatNumber(perMinuteUSDT, 6)}
          </p>
          <p className="text-xs text-oslo-success mt-1">
            {formatNumber(perMinuteOSLO, 4)} OSLO
          </p>
        </motion.div>

        {/* Accumulated Pending */}
        <motion.div
          className="p-4 rounded-xl bg-oslo-aurora/5 border border-oslo-aurora/10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-3.5 h-3.5 text-oslo-aurora" />
            <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
              Pending Yield
            </span>
          </div>
          <p className="text-lg font-mono font-light text-oslo-text-primary">
            ${formatNumber(totalPending, 4)}
          </p>
          <p className="text-xs text-oslo-aurora mt-1">
            {formatNumber(totalPendingOSLO, 2)} OSLO
          </p>
        </motion.div>

        {/* OSLO Price */}
        <motion.div
          className="p-4 rounded-xl bg-oslo-ice/10 border border-oslo-ice/20"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-3.5 h-3.5 text-oslo-ice" />
            <span className="text-[10px] text-oslo-text-muted uppercase tracking-wider">
              OSLO Price
            </span>
          </div>
          <p className="text-lg font-mono font-light text-oslo-ice">
            ${osloPrice.toFixed(6)}
          </p>
          <p className="text-xs text-oslo-text-muted mt-1">
            1 OSLO = ${osloPrice.toFixed(6)} USDT
          </p>
        </motion.div>
      </div>

      {/* Progress bar for minute */}
      <div className="mt-5 p-3 rounded-lg bg-white/[0.03] border border-white/5">
        <div className="flex items-center justify-between text-[10px] text-oslo-text-muted mb-1.5">
          <span>Estimated earnings this minute</span>
          <span className="font-mono text-oslo-success">
            +${formatNumber(perMinuteUSDT, 6)} USDT · +{formatNumber(perMinuteOSLO, 4)} OSLO
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-oslo-ice to-oslo-success"
            animate={{ width: `${(elapsed % 60) / 0.6}%` }}
            transition={{ duration: 0.25, ease: "linear" }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[9px] text-oslo-text-muted">
            Yields arrive continuously — claim anytime once above $10
          </p>
          <p className="text-[9px] text-oslo-text-muted font-mono">
            {Math.floor(elapsed % 60)}s / 60s
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
