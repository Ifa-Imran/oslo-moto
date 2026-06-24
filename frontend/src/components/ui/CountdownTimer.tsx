"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  /** Target timestamp in seconds (Unix epoch) */
  targetTimestamp: number;
  /** Label shown before the countdown */
  label?: string;
  /** Text shown when countdown reaches zero */
  expiredText?: string;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

export function CountdownTimer({
  targetTimestamp,
  label,
  expiredText = "Available now!",
  compact = false,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    const calculate = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = targetTimestamp - now;
      setTimeRemaining(remaining > 0 ? remaining : 0);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp]);

  if (timeRemaining <= 0) {
    return (
      <div className={compact ? "text-center" : "text-center py-2"}>
        <span className="text-green-400 font-medium text-sm">{expiredText}</span>
      </div>
    );
  }

  const days = Math.floor(timeRemaining / 86400);
  const hours = Math.floor((timeRemaining % 86400) / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);
  const seconds = timeRemaining % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (compact) {
    return (
      <div className="text-center">
        {label && <p className="text-xs text-slate-400 mb-1">{label}</p>}
        <p className="font-mono font-bold text-sm text-white">
          {days > 0 && `${days}d `}
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {label && <p className="text-xs text-slate-400 mb-2">{label}</p>}
      <div className="flex items-center justify-center gap-2">
        {days > 0 && (
          <div className="bg-white/10 rounded-lg px-3 py-2 min-w-[60px]">
            <p className="font-mono font-bold text-xl text-white">{pad(days)}</p>
            <p className="text-[10px] text-slate-400">DAYS</p>
          </div>
        )}
        <div className="bg-white/10 rounded-lg px-3 py-2 min-w-[60px]">
          <p className="font-mono font-bold text-xl text-white">{pad(hours)}</p>
          <p className="text-[10px] text-slate-400">HRS</p>
        </div>
        <div className="bg-white/10 rounded-lg px-3 py-2 min-w-[60px]">
          <p className="font-mono font-bold text-xl text-white">{pad(minutes)}</p>
          <p className="text-[10px] text-slate-400">MIN</p>
        </div>
        <div className="bg-white/10 rounded-lg px-3 py-2 min-w-[60px]">
          <p className="font-mono font-bold text-xl text-white">{pad(seconds)}</p>
          <p className="text-[10px] text-slate-400">SEC</p>
        </div>
      </div>
    </div>
  );
}
