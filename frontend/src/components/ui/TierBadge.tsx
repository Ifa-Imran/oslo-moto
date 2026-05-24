import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tier: number;
  className?: string;
}

const tierConfig: Record<number, { label: string; classes: string }> = {
  1: {
    label: "Tier 1",
    classes: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
  2: {
    label: "Tier 2",
    classes: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  3: {
    label: "Tier 3",
    classes: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  4: {
    label: "Tier 4",
    classes: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  5: {
    label: "Tier 5",
    classes: "bg-oslo-ice/20 text-oslo-ice border-oslo-ice/30 shadow-[0_0_8px_rgba(0,229,255,0.15)]",
  },
};

export function TierBadge({ tier, className }: TierBadgeProps) {
  const config = tierConfig[tier] || tierConfig[1];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.classes,
        className
      )}
    >
      {config.label}
    </span>
  );
}
