"use client";

import { useReferral } from "@/hooks/useReferral";
import { useAccount, useReadContract } from "wagmi";
import { shortenAddress } from "@/lib/utils/format";
import { investmentEngineABI, CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";
import { useState } from "react";

/// Calculate how many levels are unlocked based on direct downline count
function getUnlockedLevels(directCount: number): number {
  if (directCount >= 7) return 20;
  if (directCount >= 5) return 14;
  if (directCount >= 3) return 9;
  if (directCount >= 2) return 6;
  if (directCount >= 1) return 3;
  return 0;
}

/// Get the next milestone for level unlocking
function getNextMilestone(directCount: number): { count: number; levels: number } | null {
  if (directCount < 1) return { count: 1, levels: 3 };
  if (directCount < 2) return { count: 2, levels: 6 };
  if (directCount < 3) return { count: 3, levels: 9 };
  if (directCount < 5) return { count: 5, levels: 14 };
  if (directCount < 7) return { count: 7, levels: 20 };
  return null;
}

export function ReferralTree() {
  const { address } = useAccount();
  const { directReferrer, directDownlines, downlineCount, referralLink } = useReferral();
  const [copied, setCopied] = useState(false);

  // Check if user has staked (referral link only shown after staking)
  const { data: hasStaked } = useReadContract({
    address: CONTRACTS.INVESTMENT_ENGINE,
    abi: investmentEngineABI,
    functionName: "hasStaked",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  const directCount = downlineCount ? Number(downlineCount) : 0;
  const unlockedLevels = getUnlockedLevels(directCount);
  const nextMilestone = getNextMilestone(directCount);

  const copyLink = async () => {
    try {
      // Try modern Clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        // Fallback for non-secure contexts (HTTP, DApp browsers)
        const textarea = document.createElement("textarea");
        textarea.value = referralLink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Last resort: select the input field so user can manually copy
      const input = document.querySelector<HTMLInputElement>("input[readonly]");
      if (input) {
        input.focus();
        input.select();
        document.execCommand("copy");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!address) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Referral Team</h3>
        <p className="text-gray-400">Connect your wallet to view your team</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Referral Link — only shown after staking */}
      {hasStaked ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Your Referral Link</h3>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-300 font-mono"
            />
            <button
              onClick={copyLink}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Your Referral Link</h3>
          <div className="flex items-center gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4">
            <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H8m13-9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0H3m18 0v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3" />
            </svg>
            <div>
              <p className="text-yellow-400 font-medium text-sm">Make your first investment to unlock your referral link</p>
              <p className="text-gray-400 text-xs mt-1">
                Stake USDT to start earning and unlock your referral link to invite others.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Direct Referrals</p>
          <p className="text-2xl font-bold text-white">{downlineCount?.toString() || "0"}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Your Referrer</p>
          <p className="text-sm font-mono text-white mt-1">
            {directReferrer && directReferrer !== "0x0000000000000000000000000000000000000000"
              ? shortenAddress(directReferrer)
              : "None"}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-400">Levels Unlocked</p>
          <p className="text-2xl font-bold text-white">
            {unlockedLevels} / 20
          </p>
          {nextMilestone && (
            <p className="text-xs text-gray-500 mt-1">
              +{nextMilestone.count - directCount} more for L{unlockedLevels + 1}-L{nextMilestone.levels}
            </p>
          )}
        </div>
      </div>

      {/* Downlines List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Direct Team ({downlineCount?.toString() || "0"})
        </h3>
        {directDownlines && directDownlines.length > 0 ? (
          <div className="space-y-2">
            {directDownlines.map((downline: string, i: number) => (
              <div key={downline} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="font-mono text-sm text-gray-300">{shortenAddress(downline)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">
            {hasStaked
              ? "No team members yet. Share your referral link to get started!"
              : "Make your first investment to unlock your referral link and start building your team."
            }
          </p>
        )}
      </div>

      {/* Commission Levels Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Commission Structure</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { level: "L1", rate: "30%", req: "1 direct", unlocked: directCount >= 1 },
            { level: "L2", rate: "10%", req: "1 direct", unlocked: directCount >= 1 },
            { level: "L3", rate: "5%", req: "1 direct", unlocked: directCount >= 1 },
            { level: "L4-5", rate: "5%", req: "2 directs", unlocked: directCount >= 2 },
            { level: "L6", rate: "2.5%", req: "2 directs", unlocked: directCount >= 2 },
            { level: "L7-9", rate: "2.5%", req: "3 directs", unlocked: directCount >= 3 },
            { level: "L10", rate: "2.5%", req: "5 directs", unlocked: directCount >= 5 },
            { level: "L11-14", rate: "1%", req: "5 directs", unlocked: directCount >= 5 },
            { level: "L15-20", rate: "1%", req: "7 directs", unlocked: directCount >= 7 },
          ].map((item) => (
            <div key={item.level} className={`rounded p-2 border ${item.unlocked ? "bg-green-900/30 border-green-700/50" : "bg-gray-800 border-gray-700/50"}`}>
              <p className={`font-medium ${item.unlocked ? "text-green-400" : "text-white"}`}>{item.level}: {item.rate}</p>
              <p className={item.unlocked ? "text-green-600" : "text-gray-500"}>
                {item.unlocked ? "Unlocked" : item.req}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
