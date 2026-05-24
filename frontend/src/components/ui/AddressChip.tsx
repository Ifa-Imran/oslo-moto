"use client";

import { cn, truncateAddress, copyToClipboard } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface AddressChipProps {
  address: string;
  className?: string;
  showCopy?: boolean;
  truncate?: number;
}

export function AddressChip({
  address,
  className,
  showCopy = true,
  truncate = 4,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate a deterministic color from address
  const hue =
    address
      .slice(2, 10)
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-sm",
        className
      )}
    >
      {/* Blockie-style avatar */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="rounded-full flex-shrink-0"
      >
        <rect width="16" height="16" rx="8" fill={`hsl(${hue}, 60%, 40%)`} />
        <rect
          x="4"
          y="4"
          width="4"
          height="4"
          rx="1"
          fill={`hsl(${hue}, 60%, 65%)`}
        />
        <rect
          x="8"
          y="8"
          width="4"
          height="4"
          rx="1"
          fill={`hsl(${hue}, 60%, 30%)`}
        />
      </svg>
      <span className="font-mono text-xs">
        {truncateAddress(address, truncate)}
      </span>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="ml-0.5 p-0.5 hover:bg-white/10 rounded transition-colors"
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3 h-3 text-oslo-success" />
          ) : (
            <Copy className="w-3 h-3 text-oslo-text-muted" />
          )}
        </button>
      )}
    </span>
  );
}
