"use client";

import { Suspense } from "react";
import { StakeForm } from "@/components/staking/StakeForm";
import { StakingCard } from "@/components/dashboard/StakingCard";

export default function StakePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Stake</h1>
        <p className="text-gray-400 mt-1">Stake USDT to start earning daily yields</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse h-96" />}>
          <StakeForm />
        </Suspense>
        <StakingCard />
      </div>
    </div>
  );
}
