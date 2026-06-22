"use client";

import { http } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
  safepalWallet,
  rainbowWallet,
  binanceWallet,
  tokenPocketWallet,
  imTokenWallet,
  injectedWallet,
  safeWallet,
  okxWallet,
  bybitWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { type Chain } from "viem";

// Hardhat local chain
const localhost: Chain = {
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
};

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
if (!projectId || projectId === "demo-project-id") {
  console.warn(
    "[Web3] NEXT_PUBLIC_WC_PROJECT_ID is not set or is using the demo project ID. " +
      "Mobile wallets via WalletConnect will not work. Get a free project ID from https://cloud.walletconnect.com"
  );
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const config = getDefaultConfig({
  appName: "Oslo Protocol",
  appDescription: "Stake USDT, earn OSLO. Deflationary DeFi protocol on BSC.",
  appUrl,
  appIcon: `${appUrl}/favicon.ico`,
  projectId: projectId || "demo-project-id",
  chains: [bsc, bscTestnet, localhost],
  ssr: true,
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        coinbaseWallet,
        trustWallet,
      ],
    },
    {
      groupName: "Mobile",
      wallets: [
        safepalWallet,
        rainbowWallet,
        binanceWallet,
        tokenPocketWallet,
        imTokenWallet,
      ],
    },
    {
      groupName: "Other",
      wallets: [
        injectedWallet,
        okxWallet,
        bybitWallet,
        rabbyWallet,
        safeWallet,
      ],
    },
  ],
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.binance.org:8545/"),
    [localhost.id]: http("http://127.0.0.1:8545"),
    [bsc.id]: http("https://bsc-dataseed.binance.org/"),
  },
  walletConnectParameters: {
    metadata: {
      name: "Oslo Protocol",
      description: "Stake USDT, earn OSLO. Deflationary DeFi protocol on BSC.",
      url: appUrl,
      icons: [`${appUrl}/favicon.ico`],
    },
  },
});
