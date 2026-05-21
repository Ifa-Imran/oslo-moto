"use client";

import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { StatCard } from "@/components/ui/StatCard";
import { useTreasuryReads, useTreasuryWrites } from "@/hooks/useTreasury";
import { useTokenReads } from "@/hooks/useToken";
import { useLiquidityManagerReads } from "@/hooks/useLiquidityManager";
import { useAppStore } from "@/store/useAppStore";
import { CONTRACTS } from "@/lib/contracts";
import { formatToken, formatNumber, formatCompact } from "@/lib/utils";
import {
  TOTAL_SUPPLY,
  TREASURY_TO_LP_PCT,
  TREASURY_TO_OWNER_PCT,
  SELL_TAX_PCT,
} from "@/lib/constants";
import { motion } from "framer-motion";
import { Landmark, ArrowRight, Flame, Droplets, ExternalLink, AlertTriangle } from "lucide-react";

export default function TreasuryPage() {
  const { isConnected } = useAccount();
  const { addToast } = useAppStore();
  const { totalReceived, totalDistributed, pendingDistribution } = useTreasuryReads();
  const { distribute, isLoading } = useTreasuryWrites();
  const { totalBurned, totalSupply } = useTokenReads();
  const { totalLiquidityAdded, totalBurnedViaSwap } = useLiquidityManagerReads();

  // Engine BUSD balance (staked funds float)
  const { data: engineBusdBalance } = useReadContract({
    address: CONTRACTS.busd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.investmentEngine],
  });

  // Treasury BUSD balance
  const { data: treasuryBusdBalance } = useReadContract({
    address: CONTRACTS.busd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.treasury],
  });

  const received = totalReceived.data as bigint | undefined;
  const distributed = totalDistributed.data as bigint | undefined;
  const pending = pendingDistribution.data as bigint | undefined;
  const burned = totalBurned.data as bigint | undefined;
  const supply = totalSupply.data as bigint | undefined;
  const burnedSwap = totalBurnedViaSwap.data as bigint | undefined;
  const liquidityAdded = totalLiquidityAdded.data as bigint | undefined;

  const circulatingSupply = supply && burned
    ? Number(supply) / 1e18 - Number(burned) / 1e18
    : TOTAL_SUPPLY;

  const handleDistribute = async () => {
    try {
      addToast({ title: "Distributing Fees...", status: "pending" });
      const tx = await distribute();
      addToast({ title: "Fees Distributed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Distribution Failed",
        description: err?.message?.slice(0, 100),
        status: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light">Treasury & Tokenomics</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          Transparent protocol treasury and deflationary token mechanics
        </p>
      </div>

      {/* Treasury Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Fees Received"
          value={`$${received != null ? formatCompact(formatToken(received, 0)) : "0"}`}
          icon={<Landmark className="w-4 h-4" />}
        />
        <StatCard
          label="Total Distributed"
          value={`$${distributed != null ? formatCompact(formatToken(distributed, 0)) : "0"}`}
          subValue="to Rank / DAO / LP"
        />
        <StatCard
          label="Pending Distribution"
          value={`$${pending != null ? formatToken(pending, 2) : "0.00"}`}
        />
        <StatCard
          label="Total OSLO Burned"
          value={burned != null ? formatCompact(formatToken(burned, 0)) : "0"}
          icon={<Flame className="w-4 h-4 text-oslo-danger" />}
        />
      </div>

      {/* Distribute Button */}
      <IceButton
        onClick={handleDistribute}
        disabled={!pending || pending === 0n || isLoading}
        loading={isLoading}
        className="w-full"
      >
        <ArrowRight className="w-4 h-4 mr-2" />
        Distribute Fees
      </IceButton>

      {/* Distribution Pie */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-6">Fee Distribution</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
          {[
            { label: "Auto-Liquidity", pct: TREASURY_TO_LP_PCT, color: "#10b981" },
            { label: "Reward Wallet", pct: TREASURY_TO_OWNER_PCT, color: "#f59e0b" },
          ].map((item) => (
            <div key={item.label}>
              <div className="relative w-20 h-20 mx-auto mb-2">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke={item.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(item.pct / 100) * 201} 201`}
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-lg font-mono font-bold"
                  style={{ color: item.color }}
                >
                  {item.pct}%
                </span>
              </div>
              <p className="text-xs text-oslo-text-secondary">{item.label}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Tokenomics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard>
          <h2 className="text-sm font-medium mb-4">OSLO Token</h2>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-white/5">
              <span className="text-xs text-oslo-text-muted">Total Supply</span>
              <span className="text-sm font-mono">
                {formatCompact(TOTAL_SUPPLY)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-white/5">
              <span className="text-xs text-oslo-text-muted">Circulating</span>
              <span className="text-sm font-mono">
                {formatCompact(circulatingSupply)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-white/5">
              <span className="text-xs text-oslo-text-muted">Total Burned</span>
              <span className="text-sm font-mono text-oslo-danger">
                {burned != null ? formatCompact(formatToken(burned, 0)) : "0"}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-xs text-oslo-text-muted">Supply</span>
              <span className="text-sm font-mono">Fixed (no minting)</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="text-sm font-medium mb-4">Burn Sources</h2>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-white/5">
              <span className="text-xs text-oslo-text-muted">Via Sell Tax</span>
              <span className="text-sm font-mono text-oslo-danger">
                {SELL_TAX_PCT}% of volume
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-white/5">
              <span className="text-xs text-oslo-text-muted">Via Buyback</span>
              <span className="text-sm font-mono">
                {burnedSwap != null ? formatCompact(formatToken(burnedSwap, 0)) : "0"} OSLO
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-xs text-oslo-text-muted">Address</span>
              <a
                href="https://bscscan.com/address/0x000000000000000000000000000000000000dEaD"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-oslo-ice hover:underline font-mono inline-flex items-center gap-1"
              >
                0x0000...dEaD
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Sell Tax Breakdown */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-4">Sell Tax Breakdown</h2>
        <div className="space-y-3">
          <p className="text-sm text-oslo-text-secondary">
            <strong className="text-oslo-danger">{SELL_TAX_PCT}%</strong> charges will be deducted on every swap/withdrawal.
          </p>
          <p className="text-sm text-oslo-text-secondary">
            100% of the tokens collected from this {SELL_TAX_PCT}% charge will be <strong className="text-oslo-danger">burned</strong>, which reduces the token&apos;s total supply and increases the token&apos;s value.
          </p>
        </div>
      </GlassCard>

      {/* Liquidity & Protocol Reserves */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-4">Liquidity & Protocol Reserves</h2>

        {/* Protocol Fund Flow Diagram */}
        <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/5">
          <p className="text-xs text-oslo-text-muted uppercase tracking-wider mb-3">Fund Flow</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="px-2 py-1 rounded bg-oslo-ice/10 text-oslo-ice">Deposits</span>
            <span className="text-oslo-text-muted">→</span>
            <span className="px-2 py-1 rounded bg-oslo-ice/5 text-oslo-text-secondary">Engine Float</span>
            <span className="text-oslo-text-muted">→</span>
            <span className="px-2 py-1 rounded bg-oslo-success/10 text-oslo-success">Daily ROI</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono mt-2">
            <span className="px-2 py-1 rounded bg-oslo-warning/10 text-oslo-warning">10% Fee</span>
            <span className="text-oslo-text-muted">→</span>
            <span className="px-2 py-1 rounded bg-oslo-success/10 text-oslo-success">LP (50% swap OSLO)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              LP Tokens Minted
            </p>
            <p className="text-2xl font-mono font-light mt-1">
              {liquidityAdded != null ? formatCompact(formatToken(liquidityAdded, 0)) : "0"}
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Locked at 0xdead</p>
          </div>
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              Staked BUSD (Engine)
            </p>
            <p className="text-2xl font-mono font-light mt-1">
              ${engineBusdBalance != null ? formatCompact(formatToken(engineBusdBalance, 0)) : "0"}
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Float for daily ROI</p>
          </div>
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              Treasury BUSD
            </p>
            <p className="text-2xl font-mono font-light mt-1">
              ${treasuryBusdBalance != null ? formatToken(treasuryBusdBalance, 2) : "0.00"}
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Pending distribution</p>
          </div>
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              Buyback Burned
            </p>
            <p className="text-2xl font-mono font-light mt-1">
              {burnedSwap != null ? formatCompact(formatToken(burnedSwap, 0)) : "0"} OSLO
            </p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">Via PancakeSwap</p>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg bg-oslo-success/5 border border-oslo-success/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-oslo-success" />
          <p className="text-xs text-oslo-text-secondary">
            LP tokens are permanently locked at the{" "}
            <a
              href="https://bscscan.com/address/0x000000000000000000000000000000000000dEaD"
              target="_blank"
              rel="noopener noreferrer"
              className="text-oslo-ice hover:underline"
            >
              dead address
            </a>
          </p>
        </div>
        <div className="mt-3 p-3 rounded-lg bg-oslo-warning/5 border border-oslo-warning/10 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-oslo-warning mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-oslo-warning">Treasury Security</p>
            <p className="text-[10px] text-oslo-text-muted mt-0.5">
              BUSD and OSLO tokens cannot be rescued by anyone — only the Timelock can recover accidentally sent non-protocol tokens via <code className="text-oslo-text-secondary">rescueERC20</code>.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
