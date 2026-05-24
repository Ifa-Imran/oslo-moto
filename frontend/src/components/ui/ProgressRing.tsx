"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: "ice" | "aurora" | "success" | "warning" | "danger";
  showLabel?: boolean;
  label?: string;
}

const colorMap = {
  ice: { stroke: "#00e5ff", bg: "rgba(0,229,255,0.1)" },
  aurora: { stroke: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
  success: { stroke: "#10b981", bg: "rgba(16,185,129,0.1)" },
  warning: { stroke: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  danger: { stroke: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 4,
  className,
  color = "ice",
  showLabel = true,
  label,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  const colors = colorMap[color];

  // Determine actual color based on progress
  let actualColor = colors;
  if (progress >= 100) actualColor = colorMap.danger;
  else if (progress >= 75) actualColor = colorMap.warning;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={actualColor.bg}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={actualColor.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-medium text-oslo-text-primary">
          {label || `${Math.round(progress)}%`}
        </span>
      )}
    </div>
  );
}
