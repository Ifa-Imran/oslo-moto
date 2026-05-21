"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/lib/wagmi";
import { type ReactNode, useState } from "react";

// Custom OSLO dark theme for RainbowKit
const osloTheme = darkTheme({
  accentColor: "#00e5ff",
  accentColorForeground: "#05070a",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "large",
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000, // 10 seconds
            refetchInterval: 15_000, // 15 seconds auto-refresh
            retry: 2,
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={osloTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
