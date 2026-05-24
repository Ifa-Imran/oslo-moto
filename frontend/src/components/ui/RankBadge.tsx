import { cn } from "@/lib/utils";

interface RankBadgeProps {
  rank: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const rankConfig: Record<
  number,
  { label: string; colors: { primary: string; secondary: string; text: string } }
> = {
  1: {
    label: "Bronze",
    colors: {
      primary: "#CD7F32",
      secondary: "#A0522D",
      text: "#E8A87C",
    },
  },
  2: {
    label: "Silver",
    colors: {
      primary: "#C0C0C0",
      secondary: "#808080",
      text: "#E8E8E8",
    },
  },
  3: {
    label: "Gold",
    colors: {
      primary: "#FFD700",
      secondary: "#B8860B",
      text: "#FFF5CC",
    },
  },
  4: {
    label: "Platinum",
    colors: {
      primary: "#00e5ff",
      secondary: "#008B8B",
      text: "#B3F0FF",
    },
  },
  5: {
    label: "Diamond",
    colors: {
      primary: "#B9F2FF",
      secondary: "#00BFFF",
      text: "#E0F7FF",
    },
  },
  6: {
    label: "Master",
    colors: {
      primary: "#7c3aed",
      secondary: "#4C1D95",
      text: "#DDD6FE",
    },
  },
  7: {
    label: "Grandmaster",
    colors: {
      primary: "#FF4500",
      secondary: "#8B0000",
      text: "#FFDAB9",
    },
  },
};

export function RankBadge({ rank, size = "md", className }: RankBadgeProps) {
  const config = rankConfig[rank];
  if (!config) return null;

  const sizeClasses = {
    sm: "w-8 h-8 text-[8px]",
    md: "w-12 h-12 text-[10px]",
    lg: "w-16 h-16 text-xs",
  };

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <svg
        viewBox="0 0 48 48"
        className={cn("drop-shadow-lg", sizeClasses[size])}
      >
        {/* Outer hexagon */}
        <defs>
          <linearGradient id={`rank-grad-${rank}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.colors.primary} />
            <stop offset="100%" stopColor={config.colors.secondary} />
          </linearGradient>
        </defs>
        <polygon
          points="24,4 44,14 44,34 24,44 4,34 4,14"
          fill="none"
          stroke={`url(#rank-grad-${rank})`}
          strokeWidth="2"
        />
        {/* Inner smaller hexagon */}
        <polygon
          points="24,10 38,17 38,31 24,38 10,31 10,17"
          fill="none"
          stroke={config.colors.primary}
          strokeWidth="1"
          opacity="0.4"
        />
        {/* Rank number */}
        <text
          x="24"
          y="28"
          textAnchor="middle"
          fill={config.colors.text}
          fontSize="16"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {rank}
        </text>
      </svg>
      {size === "lg" && (
        <span
          className="ml-2 text-sm font-medium"
          style={{ color: config.colors.text }}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
