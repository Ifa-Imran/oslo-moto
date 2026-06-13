"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";

// Determine network from environment
const isTestnet = process.env.NEXT_PUBLIC_NETWORK === 'testnet';

export const config = getDefaultConfig({
  appName: "OSLO Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "de1938e67e453d4ff13d1689f2262e43",
  chains: isTestnet ? [bscTestnet] : [bsc],
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.binance.org:8545"),
    [bsc.id]: http("https://bsc-dataseed.binance.org/"),
  },
  ssr: true,
});
