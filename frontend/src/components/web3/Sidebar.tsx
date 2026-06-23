"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useSyncExternalStore } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/stake", label: "Stake", icon: "M12 2v20m8-10H4" },
  { href: "/income", label: "Income", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/dex", label: "DEX", icon: "M4 7h16M4 12h16M4 17h10" },
  { href: "/team", label: "Team", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 100-8 4 4 0 000 8z" },
  { href: "/leadership", label: "Leadership", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { href: "/dao", label: "DAO", icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9-5 9 5M3 7h18" },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isLocalhost = useSyncExternalStore(
    () => () => {},
    () =>
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1",
    () => false
  );

  // Close on Escape key + lock body scroll when open
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation menu"
      >
        {/* Header with logo + close button */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <Link
            href="/"
            onClick={onClose}
            className="text-xl font-bold text-slate-900 whitespace-nowrap"
          >
            OSLO <span className="text-blue-600">Protocol</span>
          </Link>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close menu"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Wallet connect — disabled in production, enabled on localhost */}
        <div className="p-4 border-b border-slate-200">
          {isLocalhost ? (
            <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} />
          ) : (
            <p className="text-xs text-slate-400 text-center">Login Temporarily Disabled</p>
          )}
        </div>

        {/* Navigation links */}
        <nav className="p-2 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.5 : 2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={item.icon}
                  />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="bg-slate-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-400">BSC Mainnet</p>
            <p className="text-xs text-slate-400 mt-1">Chain ID 56</p>
          </div>
        </div>
      </aside>
    </>
  );
}
