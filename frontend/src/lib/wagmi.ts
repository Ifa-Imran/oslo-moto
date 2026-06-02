"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bsc } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "OSLO Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "de1938e67e453d4ff13d1689f2262e43",
  chains: [bsc],
  transports: {
    [bsc.id]: http("https://bsc-dataseed.binance.org/"),
  },
  ssr: true,
});
