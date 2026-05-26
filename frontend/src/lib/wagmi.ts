"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bsc } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "OSLO Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "oslo-protocol-dapp",
  chains: [bsc],
  transports: {
    [bsc.id]: http("https://bsc-dataseed.binance.org/"),
  },
  ssr: true,
});
