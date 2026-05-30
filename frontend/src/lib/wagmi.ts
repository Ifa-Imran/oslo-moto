"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bscTestnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "OSLO Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "oslo-protocol-dapp",
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.binance.org:8545"),
  },
  ssr: true,
});
