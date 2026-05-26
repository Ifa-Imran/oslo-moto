"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Trophy,
  Crown,
  Landmark,
} from "lucide-react";

const BOTTOM_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/invest", label: "Invest", icon: TrendingUp },
  { href: "/referrals", label: "Refer", icon: Users },
  { href: "/ranks", label: "Ranks", icon: Trophy },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-oslo-void/95 backdrop-blur-xl border-t border-white/5 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {BOTTOM_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-0",
                isActive
                  ? "text-oslo-ice"
                  : "text-oslo-text-muted hover:text-oslo-text-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
