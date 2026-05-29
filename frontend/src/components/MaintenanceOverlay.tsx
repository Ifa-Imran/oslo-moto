"use client";

export function MaintenanceOverlay() {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-oslo-void">
      {/* Animated background pulse */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-oslo-ice/5 animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-oslo-aurora/5 animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Lock icon */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-full border-2 border-oslo-ice/30 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-oslo-ice animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-oslo-text-primary mb-4">
          System Upgrade in Progress
        </h1>

        {/* Description */}
        <p className="text-oslo-text-secondary text-base md:text-lg mb-6 leading-relaxed">
          We are performing a critical security update to renounce the deployer key and finalize contract ownership transfer.
        </p>

        {/* Timer box */}
        <div className="bg-oslo-elevated/80 border border-oslo-ice/10 rounded-xl p-6 mb-6">
          <p className="text-oslo-text-muted text-sm uppercase tracking-wider mb-2">
            Estimated Downtime
          </p>
          <p className="text-3xl font-mono font-bold text-oslo-ice">
            ~24 Hours
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 text-oslo-text-muted text-sm">
          <span className="w-2 h-2 rounded-full bg-oslo-warning animate-pulse" />
          <span>Maintenance in progress — please check back later</span>
        </div>

        {/* Footer */}
        <p className="mt-8 text-oslo-text-muted text-xs">
          OSLO Protocol &bull; Security First
        </p>
      </div>
    </div>
  );
}
