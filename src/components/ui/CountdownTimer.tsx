"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  targetTimestamp: number; // Unix timestamp in seconds
  className?: string;
  onExpire?: () => void;
  showDays?: boolean;
}

export function CountdownTimer({
  targetTimestamp,
  className,
  onExpire,
  showDays = true,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const now = Math.floor(Date.now() / 1000);
    const diff = targetTimestamp - now;
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, expired: true };
    return {
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
      expired: false,
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const tl = calculateTimeLeft();
      setTimeLeft(tl);
      if (tl.expired && onExpire) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [targetTimestamp, onExpire]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span className={cn("font-mono tabular-nums tracking-wider", className)}>
      {timeLeft.expired ? (
        <span className="text-oslo-danger">EXPIRED</span>
      ) : (
        <>
          {showDays && <span>{timeLeft.d}d </span>}
          <span>{pad(timeLeft.h)}</span>
          <span className="text-oslo-text-muted mx-0.5">:</span>
          <span>{pad(timeLeft.m)}</span>
          <span className="text-oslo-text-muted mx-0.5">:</span>
          <span>{pad(timeLeft.s)}</span>
        </>
      )}
    </span>
  );
}
