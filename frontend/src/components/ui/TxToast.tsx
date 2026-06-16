"use client";

import { cn, bscScanUrl, truncateAddress } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { useEffect } from "react";

export type TxStatus = "pending" | "success" | "error";

export interface TxToastData {
  id: string;
  title: string;
  description?: string;
  txHash?: string;
  status: TxStatus;
}

interface TxToastProps {
  toast: TxToastData;
  onDismiss: (id: string) => void;
}

export function TxToast({ toast, onDismiss }: TxToastProps) {
  useEffect(() => {
    if (toast.status !== "pending") {
      const timer = setTimeout(() => onDismiss(toast.id), 8000);
      return () => clearTimeout(timer);
    }
  }, [toast.status, toast.id, onDismiss]);

  const statusConfig = {
    pending: {
      icon: <Loader2 className="w-5 h-5 text-oslo-ice animate-spin" />,
      borderClass: "border-oslo-ice/30",
      bgClass: "bg-oslo-ice-dim",
    },
    success: {
      icon: <CheckCircle className="w-5 h-5 text-oslo-success" />,
      borderClass: "border-oslo-success/30",
      bgClass: "bg-oslo-success/10",
    },
    error: {
      icon: <XCircle className="w-5 h-5 text-oslo-danger" />,
      borderClass: "border-oslo-danger/30",
      bgClass: "bg-oslo-danger-dim",
    },
  };

  const config = statusConfig[toast.status];

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-card border backdrop-blur-xl animate-in slide-in-from-right",
        config.borderClass,
        config.bgClass,
        "bg-white/5"
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-oslo-text-primary">
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-xs text-oslo-text-secondary mt-0.5">
            {toast.description}
          </p>
        )}
        {toast.txHash && (
          <a
            href={bscScanUrl(toast.txHash, "tx")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-xs text-oslo-ice hover:underline"
          >
            {truncateAddress(toast.txHash, 6)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// Toast container
interface TxToastContainerProps {
  toasts: TxToastData[];
  onDismiss: (id: string) => void;
}

export function TxToastContainer({ toasts, onDismiss }: TxToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <TxToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
