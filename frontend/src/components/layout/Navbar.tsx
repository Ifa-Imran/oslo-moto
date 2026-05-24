"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useTokenReads } from "@/hooks/useToken";
import { formatToken } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useEffect } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/invest", label: "Invest" },
  { href: "/referrals", label: "Referrals" },
  { href: "/ranks", label: "Ranks" },
  { href: "/dao", label: "DAO" },
  { href: "/treasury", label: "Treasury" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { setAddress } = useAppStore();
  const { osloBalance } = useTokenReads(address);

  useEffect(() => {
    setAddress(address);
  }, [address, setAddress]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-oslo-void/80 backdrop-blur-xl border-b border-white/5">
      <div className="h-full max-w-[1920px] mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-oslo-ice/10 border border-oslo-ice/30 flex items-center justify-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a10 10 0 0 1 0 20" opacity="0.5" />
              <line x1="12" y1="2" x2="12" y2="22" opacity="0.3" />
            </svg>
          </div>
          <span className="text-sm font-medium tracking-wide text-oslo-text-primary hidden sm:block">
            OSLO
          </span>
        </Link>

        {/* Center Nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-2 rounded-btn text-sm font-medium transition-colors",
                pathname === item.href
                  ? "text-oslo-ice bg-oslo-ice-dim"
                  : "text-oslo-text-secondary hover:text-oslo-text-primary hover:bg-white/5"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* Network indicator */}
          {isConnected && (
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-oslo-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-oslo-success" />
              BNB Chain
            </span>
          )}

          {/* Balance */}
          {isConnected && osloBalance.data != null && (
            <span className="hidden lg:inline-flex items-center gap-1 text-xs text-oslo-text-secondary font-mono">
              <span className="text-oslo-text-muted">OSLO:</span>
              {formatToken(osloBalance.data as bigint, 0)}
            </span>
          )}

          {/* Wallet Connect */}
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="address"
          />
        </div>
      </div>
    </nav>
  );
}
