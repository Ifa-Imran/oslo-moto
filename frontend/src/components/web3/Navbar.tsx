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

      <nav className="border-b border-gray-800 bg-gray-950 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-3">
              {/* Hamburger button — visible on all screen sizes */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
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
                className="text-lg sm:text-xl font-bold text-white whitespace-nowrap"
              >
                OSLO <span className="text-blue-500">Protocol</span>
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
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 px-3 py-2">Login Disabled</span>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
