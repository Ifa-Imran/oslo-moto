import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with commas and optional decimal places
 */
export function formatNumber(value: number | string, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a BUSD/OSLO amount from wei (18 decimals)
 */
export function formatToken(value: bigint | string, decimals = 2): string {
  const num = Number(value) / 1e18;
  return formatNumber(num, decimals);
}

/**
 * Format token value with compact notation for large numbers
 */
export function formatCompact(value: number | string): string {
  // Strip locale commas if string (e.g. "12,280" → "12280")
  const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

/**
 * Truncate an address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a Unix timestamp to locale date/time
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a Unix timestamp to relative time
 */
export function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Format duration in seconds to D:H:M:S
 */
export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Robust clipboard copy that works in dApp browsers (MetaMask Mobile, Trust Wallet, etc.)
 * Falls back from navigator.clipboard → execCommand('copy') with a temporary textarea.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Path 1: Modern Clipboard API (requires secure context + user gesture)
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API failed — fall through to legacy method
    }
  }

  // Path 2: Legacy execCommand fallback (works in all WebViews)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Prevent scrolling on iOS
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}

/**
 * Get BscScan URL for address or tx
 */
export function bscScanUrl(
  hash: string,
  type: "address" | "tx" = "address",
  testnet = false
): string {
  const base = testnet
    ? "https://testnet.bscscan.com"
    : "https://bscscan.com";
  return `${base}/${type}/${hash}`;
}
