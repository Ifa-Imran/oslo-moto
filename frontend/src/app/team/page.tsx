"use client";

import { ReferralTree } from "@/components/team/ReferralTree";

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Team</h1>
        <p className="text-gray-400 mt-1">Manage your referral network and earn level commissions</p>
      </div>

      <ReferralTree />
    </div>
  );
}
