"use client";

import { useAccount } from "wagmi";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatCard } from "@/components/ui/StatCard";
import { useDAOReads, useDAOWrites } from "@/hooks/useDAO";
import { useReferralReads } from "@/hooks/useReferral";
import { useAppStore } from "@/store/useAppStore";
import { formatToken, formatNumber, formatCompact } from "@/lib/utils";
import { MAX_DAO_MEMBERS, DAO_TEAM_SIZE_REQUIREMENT, DAO_MONTHLY_ROYALTY_PCT } from "@/lib/constants";
import { Crown, CheckCircle, Clock, Users, Gift, History } from "lucide-react";

export default function DAOPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useAppStore();
  const { isDAOMember, daoMemberCount, pendingRoyalty, allDAOMembers, royaltyPoolBalance, currentMonthId, totalRoyaltiesDistributed } = useDAOReads(address);
  const { claimRoyalty, isLoading } = useDAOWrites();
  const { teamSize } = useReferralReads(address);

  const isMember = isDAOMember.data as boolean | undefined;
  const memberCount = Number(daoMemberCount.data || 0);
  const royalty = pendingRoyalty.data as bigint | undefined;
  const team = Number(teamSize.data || 0);
  const members = (allDAOMembers.data as string[]) || [];
  const poolBalance = royaltyPoolBalance.data as bigint | undefined;
  const monthId = Number(currentMonthId.data || 0);
  const totalDist = totalRoyaltiesDistributed.data as bigint | undefined;

  const handleClaim = async () => {
    try {
      addToast({ title: "Claiming Royalty...", status: "pending" });
      const tx = await claimRoyalty();
      addToast({ title: "Royalty Claimed!", status: "success", txHash: tx });
    } catch (err: any) {
      addToast({
        title: "Claim Failed",
        description: err?.message?.slice(0, 100),
        status: "error",
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-light">DAO Governance</h1>
          <p className="mt-1 text-sm text-oslo-text-secondary">
            Exclusive DAO membership with monthly royalty distributions
          </p>
        </div>
        <GlassCard className="text-center py-16">
          <Crown className="w-12 h-12 text-oslo-text-muted mx-auto mb-4" />
          <p className="text-oslo-text-secondary">Connect wallet to check DAO status</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-light">DAO Governance</h1>
        <p className="mt-1 text-sm text-oslo-text-secondary">
          Exclusive membership — limited to {MAX_DAO_MEMBERS} members
        </p>
      </div>

      {/* DAO Status */}
      <GlassCard>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
              DAO Members
            </p>
            <p className="text-3xl font-mono font-light mt-1">
              <span className="text-oslo-ice">{memberCount}</span>
              <span className="text-oslo-text-muted text-xl">/{MAX_DAO_MEMBERS}</span>
            </p>
          </div>

          {isMember ? (
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-oslo-success/10 border border-oslo-success/30">
              <Crown className="w-5 h-5 text-oslo-success" />
              <div>
                <p className="text-sm font-medium text-oslo-success">DAO Member</p>
                <p className="text-xs text-oslo-text-muted">Qualified</p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-sm font-medium text-oslo-text-primary mb-3">
                Requirements to Qualify
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {team >= DAO_TEAM_SIZE_REQUIREMENT ? (
                    <CheckCircle className="w-4 h-4 text-oslo-success" />
                  ) : (
                    <Clock className="w-4 h-4 text-oslo-text-muted" />
                  )}
                  <span className="text-xs text-oslo-text-secondary">
                    Team size: {team}/{DAO_TEAM_SIZE_REQUIREMENT}+
                  </span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full ml-2 max-w-[120px]">
                    <div
                      className="h-full bg-oslo-ice rounded-full transition-all"
                      style={{
                        width: `${Math.min((team / DAO_TEAM_SIZE_REQUIREMENT) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {memberCount < MAX_DAO_MEMBERS ? (
                    <CheckCircle className="w-4 h-4 text-oslo-success" />
                  ) : (
                    <Clock className="w-4 h-4 text-oslo-text-muted" />
                  )}
                  <span className="text-xs text-oslo-text-secondary">
                    Slots available: {MAX_DAO_MEMBERS - memberCount}/{MAX_DAO_MEMBERS}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Protocol Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Royalty Pool"
          value={`$${poolBalance != null ? formatToken(poolBalance, 0) : "0"}`}
        />
        <StatCard
          label="Total Distributed"
          value={`$${totalDist != null ? formatToken(totalDist, 0) : "0"}`}
        />
        <StatCard
          label="Current Month"
          value={`#${monthId}`}
          mono={false}
        />
      </div>

      {/* Royalty Interface */}
      {isMember && (
        <>
          <GlassCard>
            <h2 className="text-sm font-medium mb-4">Monthly Royalty</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
                  Royalty Rate
                </p>
                <p className="text-2xl font-mono font-light mt-1">{DAO_MONTHLY_ROYALTY_PCT}%</p>
                <p className="text-[10px] text-oslo-text-muted mt-0.5">
                  of protocol turnover
                </p>
              </div>
              <div>
                <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
                  Your Share
                </p>
                <p className="text-2xl font-mono font-light text-oslo-ice mt-1">
                  ${royalty != null ? formatToken(royalty, 2) : "0.00"}
                </p>
                <p className="text-[10px] text-oslo-text-muted mt-0.5">
                  split among {memberCount} members
                </p>
              </div>
              <div>
                <p className="text-xs text-oslo-text-muted uppercase tracking-wider">
                  Status
                </p>
                <p className="text-sm mt-1 text-oslo-text-secondary">
                  {royalty != null && royalty > 0n
                    ? "Ready to claim"
                    : "No royalty available"}
                </p>
              </div>
            </div>
            <IceButton
              onClick={handleClaim}
              disabled={!royalty || royalty === 0n || isLoading}
              loading={isLoading}
              className="w-full"
            >
              <Gift className="w-4 h-4 mr-2" />
              Claim Royalty
            </IceButton>
          </GlassCard>
        </>
      )}

      {/* Royalty History */}
      {isMember && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-oslo-text-muted" />
            <h2 className="text-sm font-medium">Royalty History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-oslo-text-muted uppercase tracking-wider border-b border-white/5">
                  <th className="text-left py-3 px-3">Month</th>
                  <th className="text-right py-3 px-3 hidden sm:table-cell">Turnover</th>
                  <th className="text-right py-3 px-3 hidden md:table-cell">Pool</th>
                  <th className="text-right py-3 px-3">Your Share</th>
                  <th className="text-center py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5 text-center">
                  <td colSpan={5} className="py-10">
                    <History className="w-8 h-8 text-oslo-text-muted mx-auto mb-2" />
                    <p className="text-sm text-oslo-text-secondary">
                      Royalty history will appear after your first distribution
                    </p>
                    <p className="text-xs text-oslo-text-muted mt-1">
                      Past claims are indexed by the subgraph
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* DAO Members Grid */}
      <GlassCard>
        <h2 className="text-sm font-medium mb-4">DAO Members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-oslo-text-muted text-center py-8">
            No members have qualified yet
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.slice(0, 12).map((addr, i) => (
              <div
                key={addr}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5"
              >
                <span className="text-xs font-mono text-oslo-text-muted w-6">
                  #{i + 1}
                </span>
                <AddressChip address={addr} />
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
