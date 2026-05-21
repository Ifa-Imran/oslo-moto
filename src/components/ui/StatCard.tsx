"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { type ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  change?: number; // percentage
  changeLabel?: string;
  icon?: ReactNode;
  className?: string;
  mono?: boolean;
}

export function StatCard({
  label,
  value,
  subValue,
  change,
  changeLabel,
  icon,
  className,
  mono = true,
}: StatCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === 0;

  return (
    <div className={cn("glass-card p-5", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-oslo-text-muted uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="text-oslo-text-muted">{icon}</span>
        )}
      </div>
      <div
        className={cn(
          "text-2xl font-light tracking-tight text-oslo-text-primary",
          mono && "font-mono tabular-nums"
        )}
      >
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        {subValue && (
          <span className="text-xs text-oslo-text-muted">{subValue}</span>
        )}
        {change !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              isPositive && "text-oslo-success",
              isNegative && "text-oslo-danger",
              isNeutral && "text-oslo-text-muted"
            )}
          >
            {isPositive && <TrendingUp className="w-3 h-3" />}
            {isNegative && <TrendingDown className="w-3 h-3" />}
            {isNeutral && <Minus className="w-3 h-3" />}
            {Math.abs(change).toFixed(2)}%
          </span>
        )}
        {changeLabel && (
          <span className="text-xs text-oslo-text-muted">{changeLabel}</span>
        )}
      </div>
    </div>
  );
}
