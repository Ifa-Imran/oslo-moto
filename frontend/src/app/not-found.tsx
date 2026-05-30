"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-8">
      <GlassCard className="max-w-lg w-full text-center p-8 md:p-12">
        {/* 404 Visual */}
        <div className="relative mb-6">
          <div className="text-[120px] font-light leading-none bg-gradient-to-b from-oslo-ice to-oslo-ice/20 bg-clip-text text-transparent select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border border-oslo-ice/20 animate-pulse" />
          </div>
        </div>

        <h2 className="text-xl font-medium text-oslo-text-primary mb-2">
          Route Not Found
        </h2>
        <p className="text-sm text-oslo-text-secondary mb-8 max-w-sm mx-auto">
          This region of the protocol has not been mapped. Navigate back to known
          territory.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <IceButton>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Return to Dashboard
            </IceButton>
          </Link>
          <Link href="/invest">
            <IceButton variant="ghost">
              <Compass className="w-4 h-4 mr-1" />
              Go to Invest
            </IceButton>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
