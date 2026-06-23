"use client";

import { useAccount, useSwitchChain, useConnect, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { CONTRACTS } from "@/lib/contracts";
import { bsc } from "wagmi/chains";

// ABI for checking registration status
const referralRegistryABI = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// EIP-1193 provider type for Dapp browser fallbacks
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isSafePal?: boolean;
  isTokenPocket?: boolean;
  isBinance?: boolean;
};

// Pages that don't require registration
const PUBLIC_PATHS = ["/register"];

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    trustwallet?: Eip1193Provider;
    safepal?: Eip1193Provider;
    binanceChain?: Eip1193Provider;
  }
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Avoid hydration mismatch: render the same content on server and initial client render
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Use wagmi for wallet state (works with RainbowKit + all wallets)
  const {
    address,
    isConnected,
    chainId: wagmiChainId,
    isConnecting,
  } = useAccount();
  const { switchChain } = useSwitchChain();

  const [injectedProvider] = useState<Eip1193Provider | null>(() => {
    if (typeof window === "undefined") return null;
    return (
      window.ethereum ||
      window.trustwallet ||
      window.safepal ||
      window.binanceChain
    ) as Eip1193Provider | null;
  });

  const { connect, connectors, isPending: isConnectPending } = useConnect();

  const fallbackConnect = useCallback(() => {
    const provider =
      injectedProvider ||
      (typeof window !== "undefined" ? window.ethereum : undefined);

    const injectedConnector = connectors.find((c) => c.id === "injected");
    if (injectedConnector) {
      connect({ connector: injectedConnector });
      return;
    }

    // Direct EIP-1193 fallback if wagmi connector isn't available
    if (provider) {
      provider
        .request({ method: "eth_requestAccounts" })
        .then(() => window.location.reload())
        .catch((e) => {
          console.error("[AuthGuard] fallback connect failed:", e);
          alert("Connection failed: " + getErrorMessage(e));
        });
    } else {
      alert(
        "No injected wallet provider found.\n\nIf you are in a Dapp browser, try refreshing or use the wallet's built-in browser."
      );
    }
  }, [connect, connectors, injectedProvider]);

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const onWrongChain = isConnected && wagmiChainId !== bsc.id;

  // Switch to BSC Mainnet via wagmi (works for any connected wallet)
  const switchToBSCMainnet = useCallback(() => {
    if (switchChain) {
      switchChain({ chainId: bsc.id });
    }
  }, [switchChain]);

  // Check registration via wagmi useReadContract (uses same RPC as rest of app)
  // This is more reliable on DApp browsers than raw fetch to a public RPC endpoint
  const {
    data: isRegistered,
    isLoading: checking,
    error: regCheckError,
    refetch: refetchRegistration,
  } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    chainId: bsc.id, // Force BSC mainnet regardless of wallet chain
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 5000, // Re-check every 5 seconds
      retry: 3,
      retryDelay: 2000,
    },
  });

  // Check if user just registered (sessionStorage grace period to prevent loops)
  // Uses useSyncExternalStore to avoid hydration mismatch and setState-in-effect lint error
  const justRegistered = useSyncExternalStore(
    () => () => {}, // No subscription needed — re-checked on re-render
    () => {
      const ts = sessionStorage.getItem("oslo_just_registered");
      if (ts) {
        const elapsed = Date.now() - parseInt(ts);
        if (elapsed < 60000) return true;
        sessionStorage.removeItem("oslo_just_registered");
      }
      return false;
    },
    () => false // SSR returns false
  );

  // Redirect logic — only redirect on CONFIRMED false, not on errors
  useEffect(() => {
    if (!isConnected || !address) return;

    // If user just registered, give grace period — don't redirect to /register
    if (justRegistered) return;

    // Only redirect if we have a definitive answer (not loading, not erroring)
    if (isRegistered === true && pathname === "/register") {
      router.replace("/");
    } else if (isRegistered === false && !isPublicPath && !regCheckError) {
      // Only redirect to register if we're SURE they're not registered
      router.replace("/register");
    }
  }, [isConnected, address, isRegistered, isPublicPath, pathname, router, justRegistered, regCheckError]);

  // Check if running on localhost (login enabled locally, disabled in production)
  const isLocalhost = isClient &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // ⛔ LOGIN TEMPORARILY DISABLED in production
  // Show maintenance message for unauthenticated users on production only
  if (!isConnected && !isConnecting && !isLocalhost) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🚧</div>
          <h2 className="text-2xl font-bold text-white mb-2">Login Temporarily Disabled</h2>
          <p className="text-gray-400 mb-6">
            We are performing maintenance. Please check back soon.
          </p>
        </div>
      </div>
    );
  }

  // Not connected on a protected path - show RainbowKit connect button (localhost only)
  if (!isConnected && !isConnecting && !isPublicPath && isLocalhost) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔗</div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6">
            Choose a wallet to access Oslo Protocol. Connect to BSC Mainnet (Chain ID 56).
          </p>
          <div className="flex flex-col items-center gap-3">
            <ConnectButton showBalance={false} />
            <button
              onClick={fallbackConnect}
              disabled={isConnectPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {isConnectPending ? "Connecting..." : "Connect with Dapp Browser Wallet"}
            </button>
            {isClient && (
              <p className="text-[10px] text-gray-500">
                Provider detected: {injectedProvider ? "YES" : "NO"}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // On public paths, allow unconnected users to see the page content (e.g., /register)
  if (!isConnected && !isConnecting && isPublicPath) {
    return <>{children}</>;
  }

  // Connected but wrong chain
  if (onWrongChain) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-gray-900 border border-yellow-800/30 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Wrong Network</h2>
          <p className="text-gray-400 mb-2">
            You are connected to chain ID:{" "}
            <span className="font-mono text-yellow-400">{wagmiChainId ?? "?"}</span>
          </p>
          <p className="text-gray-400 mb-6">
            Please switch to BSC Mainnet (Chain ID 56) to use Oslo Protocol.
          </p>
          <button
            onClick={switchToBSCMainnet}
            disabled={!switchChain}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Switch to BSC Mainnet
          </button>
        </div>
      </div>
    );
  }

  // Connected, on right chain, but still checking or registration status is undefined
  if (checking || isRegistered === undefined || isRegistered === null) {
    // If there's an error, show retry instead of endless spinner
    if (regCheckError && !justRegistered) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-gray-400 mb-4">Unable to verify registration status.</p>
            <button
              onClick={() => refetchRegistration()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Retry
            </button>
            {isClient && address && (
              <p className="text-xs text-gray-500 mt-2 font-mono break-all px-4">{address}</p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Checking registration status...</p>
          {isClient && address && (
            <p className="text-xs text-gray-500 mt-2 font-mono break-all px-4">{address}</p>
          )}
        </div>
      </div>
    );
  }

  // Not registered, not on public path -> redirect spinner
  // Only show this if we're CONFIDENT (no error, not in grace period)
  if (isRegistered === false && !isPublicPath && !regCheckError && !justRegistered) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Redirecting to registration...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
