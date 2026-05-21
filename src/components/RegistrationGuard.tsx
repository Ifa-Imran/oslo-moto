"use client";

import { useAccount } from "wagmi";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useReferralReads } from "@/hooks/useReferral";
import { Skeleton } from "@/components/ui/Skeleton";

export function RegistrationGuard({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const { isRegistered } = useReferralReads(address);

  const registered = isRegistered.data as boolean | undefined;

  // Landing page is always accessible — no redirect needed
  const isLanding = pathname === "/";

  useEffect(() => {
    // Only guard non-landing pages
    if (isLanding) return;

    // If not connected, redirect to landing
    if (!isConnected) {
      router.replace("/");
      return;
    }

    // If registration check is complete and user is NOT registered, redirect
    if (registered === false) {
      router.replace("/");
    }
  }, [isLanding, isConnected, registered, router]);

  // Landing page always renders freely
  if (isLanding) return <>{children}</>;

  // Still loading registration status — show skeleton
  if (!isConnected || registered === undefined) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Not registered — block access (redirect already triggered in useEffect)
  if (!registered) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-oslo-text-muted text-sm">
          Redirecting to registration...
        </p>
      </div>
    );
  }

  // Registered — allow access to all pages
  return <>{children}</>;
}
