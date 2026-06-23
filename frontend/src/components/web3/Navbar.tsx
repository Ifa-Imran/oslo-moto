"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Sidebar } from "./Sidebar";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/stake", label: "Stake" },
  { href: "/income", label: "Income" },
  { href: "/dex", label: "DEX" },
  { href: "/team", label: "Team" },
  { href: "/leadership", label: "Leadership" },
  { href: "/dao", label: "DAO" },
];

export function Navbar() {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <nav className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-3">
              {/* Hamburger button — visible on all screen sizes */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Open menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              <Link
                href="/"
                className="text-lg sm:text-xl font-bold text-slate-900 whitespace-nowrap"
              >
                OSLO <span className="text-blue-600">Protocol</span>
              </Link>

              {/* Desktop nav links — visible on large screens */}
              <div className="hidden lg:flex items-center space-x-1 ml-4">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0">
              <ConnectButton
                chainStatus="icon"
                accountStatus="avatar"
                showBalance={false}
              />
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
