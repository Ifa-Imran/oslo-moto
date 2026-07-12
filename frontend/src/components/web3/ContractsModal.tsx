"use client";

import { useState, useEffect } from "react";

const BSCSCAN_BASE = "https://bscscan.com/address";

const contractList = [
  {
    name: "OSLO Token",
    symbol: "OSLO",
    address: process.env.NEXT_PUBLIC_OSLO_TOKEN_ADDRESS || "",
    desc: "ERC20 token contract",
  },
  {
    name: "Investment Engine",
    symbol: "ENGINE",
    address: process.env.NEXT_PUBLIC_INVESTMENT_ENGINE_ADDRESS || "",
    desc: "Staking & yield distribution",
  },
  {
    name: "Oslo DEX",
    symbol: "DEX",
    address: process.env.NEXT_PUBLIC_OSLO_DEX_ADDRESS || "",
    desc: "Token swap & burn mechanism",
  },
  {
    name: "Referral Registry",
    symbol: "REFERRAL",
    address: process.env.NEXT_PUBLIC_REFERRAL_REGISTRY_ADDRESS || "",
    desc: "User registration & referral tree",
  },
  {
    name: "Reward Vault",
    symbol: "VAULT",
    address: process.env.NEXT_PUBLIC_REWARD_VAULT_ADDRESS || "",
    desc: "OSLO token vault for rewards",
  },
  {
    name: "Level Income System",
    symbol: "LEVEL",
    address: process.env.NEXT_PUBLIC_LEVEL_INCOME_SYSTEM_ADDRESS || "",
    desc: "20-level referral commissions",
  },
  {
    name: "Leadership Bonus",
    symbol: "LEADERSHIP",
    address: process.env.NEXT_PUBLIC_LEADERSHIP_BONUS_ADDRESS || "",
    desc: "Leadership rank bonuses",
  },
  {
    name: "Oslo DAO",
    symbol: "DAO",
    address: process.env.NEXT_PUBLIC_OSLO_DAO_ADDRESS || "",
    desc: "Governance contract",
  },
  {
    name: "USDT (BSC)",
    symbol: "USDT",
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955",
    desc: "Stablecoin used for staking",
  },
];

const walletList = [
  {
    name: "Reward Wallet",
    address: process.env.NEXT_PUBLIC_REWARD_WALLET || "",
  },
  {
    name: "Company Wallet",
    address: process.env.NEXT_PUBLIC_COMPANY_WALLET || "",
  },
  {
    name: "Performance Wallet",
    address: process.env.NEXT_PUBLIC_PERF_WALLET || "",
  },
];

function shortAddr(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ContractsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

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

  if (!isOpen) return null;

  const copyAddress = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(addr);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Fallback for DApp browsers
      const textarea = document.createElement("textarea");
      textarea.value = addr;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(addr);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              <h2 className="text-lg font-bold text-slate-900">
                Contract Addresses
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Contracts */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Smart Contracts
              </h3>
              <div className="space-y-2">
                {contractList.map((c) => {
                  if (!c.address) return null;
                  return (
                    <div
                      key={c.address}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {c.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {c.symbol}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copyAddress(c.address)}
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            aria-label="Copy address"
                            title="Copy address"
                          >
                            {copied === c.address ? (
                              <svg
                                className="w-4 h-4 text-green-500"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            )}
                          </button>
                          <a
                            href={`${BSCSCAN_BASE}/${c.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            aria-label="View on BscScan"
                            title="View on BscScan"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">{c.desc}</p>
                      <p className="text-xs font-mono text-slate-400 break-all">
                        {c.address}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Operational Wallets */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Operational Wallets
              </h3>
              <div className="space-y-2">
                {walletList.map((w) => {
                  if (!w.address) return null;
                  return (
                    <div
                      key={w.address}
                      className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3"
                    >
                      <div>
                        <span className="text-sm font-semibold text-slate-900">
                          {w.name}
                        </span>
                        <p className="text-xs font-mono text-slate-400">
                          {shortAddr(w.address)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyAddress(w.address)}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          aria-label="Copy address"
                          title="Copy address"
                        >
                          {copied === w.address ? (
                            <svg
                              className="w-4 h-4 text-green-500"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                        <a
                          href={`${BSCSCAN_BASE}/${w.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          aria-label="View on BscScan"
                          title="View on BscScan"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-center text-slate-400">
              BSC Mainnet &middot; Chain ID 56 &middot; All addresses verified on BscScan
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
