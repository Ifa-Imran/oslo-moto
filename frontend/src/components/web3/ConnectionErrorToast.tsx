"use client";

import { useEffect } from "react";
import { useConnect } from "wagmi";
import toast from "react-hot-toast";

export function ConnectionErrorToast() {
  const { error, reset } = useConnect();

  useEffect(() => {
    if (!error) return;

    const message =
      (error as Error)?.message ||
      (error as { shortMessage?: string })?.shortMessage ||
      "Wallet connection failed";

    // Log full error to console for desktop debugging
    console.error("[WalletConnect Error]", error);

    const toastId = toast.error(
      () => (
        <div className="flex flex-col gap-1 max-w-sm">
          <span className="font-semibold">Connection failed</span>
          <span className="text-xs opacity-90 break-words">{message}</span>
          <span className="text-[10px] opacity-70">
            Check WalletConnect Cloud settings &amp; Allowed Domains.
          </span>
        </div>
      ),
      { duration: 8000 }
    );

    reset();

    return () => {
      toast.dismiss(toastId);
    };
  }, [error, reset]);

  return null;
}
