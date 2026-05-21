"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Trophy,
  Crown,
  Landmark,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const SIDEBAR_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invest", label: "Invest", icon: TrendingUp },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/ranks", label: "Ranks", icon: Trophy },
  { href: "/dao", label: "DAO", icon: Crown },
  { href: "/treasury", label: "Treasury", icon: Landmark },
];

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed top-16 left-0 bottom-0 z-40 hidden lg:flex flex-col bg-oslo-base/60 backdrop-blur-xl border-r border-white/5 transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-oslo-elevated border border-white/10 flex items-center justify-center hover:border-white/20 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-oslo-text-muted" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-oslo-text-muted" />
        )}
      </button>

      {/* User profile card */}
      {!collapsed && (
        <div className="p-4 border-b border-white/5">
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-oslo-ice-dim border border-oslo-ice/20 flex items-center justify-center">
                  <span className="text-oslo-ice text-sm font-mono font-bold">
                    {address?.slice(2, 4).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-oslo-text-primary truncate">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                  <p className="text-xs text-oslo-text-muted">Connected</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-oslo-text-muted text-center py-4">
              Connect wallet to view profile
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "text-oslo-ice bg-oslo-ice-dim border-l-2 border-oslo-ice"
                  : "text-oslo-text-secondary hover:text-oslo-text-primary hover:bg-white/5 border-l-2 border-transparent"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom branding */}
      {!collapsed && (
        <div className="p-4 border-t border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-oslo-text-muted">
            OSLO Protocol v1
          </p>
        </div>
      )}
    </aside>
  );
}
