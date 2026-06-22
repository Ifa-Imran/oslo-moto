/**
 * Format USDT amount (6 decimals) to readable string
 */
export function formatUSDT(amount: bigint | undefined): string {
  if (!amount) return "0.00";
  const value = Number(amount) / 1e6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format OSLO amount (18 decimals) to readable string
 */
export function formatOSLO(amount: bigint | undefined): string {
  if (!amount) return "0.00";
  const value = Number(amount) / 1e18;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/**
 * Format DEX price (18 decimals representing USDT per OSLO)
 */
export function formatPrice(price: bigint | undefined): string {
  if (!price) return "0.000000";
  // Price is stored as (usdtReserve * 1e18) / osloReserve
  // usdtReserve is in 6 decimal USDT units
  const value = Number(price) / 1e6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

/**
 * Shorten an address for display
 */
export function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a timestamp to relative time
 */
export function formatTimeAgo(timestamp: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const diff = now - timestamp;
  const days = Number(diff) / 86400;

  if (days < 1) return "Today";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Calculate progress percentage
 */
export function calcProgress(earned: bigint, stake: bigint): number {
  if (!stake || stake === 0n) return 0;
  const cap = stake * 3n;
  return Number((earned * 100n) / cap);
}
