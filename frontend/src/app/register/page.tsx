"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CONTRACTS, usdtABI } from "@/lib/contracts";
import { isAddress, parseUnits, formatUnits } from "viem";
import { useRouter, useSearchParams } from "next/navigation";
import { bsc } from "wagmi/chains";

const REGISTRATION_FEE = parseUnits("1", 18); // $1.00 USDT (BSC 18 decimals)

const referralRegistryABI = [
  {
    inputs: [{ name: "referrer", type: "address" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Extract a short, user-friendly message from viem/wagmi errors
function getCleanErrorMessage(e: unknown): string {
  if (!e) return "Transaction failed. Please try again.";

  // viem errors often have a shortMessage field
  const anyErr = e as { shortMessage?: string; message?: string; name?: string; details?: string };
  if (anyErr.shortMessage) return anyErr.shortMessage;

  const msg = anyErr.message || anyErr.details || String(e);

  // User rejected the transaction in their wallet
  if (/user rejected|rejected the request|denied|cancelled/i.test(msg)) {
    return "You rejected the transaction in your wallet. Please try again and approve both prompts.";
  }
  // Insufficient funds for gas
  if (/insufficient funds|gas required/i.test(msg)) {
    return "Insufficient BNB for gas fees. Please fund your wallet with BNB.";
  }
  // Network issues
  if (/network error|failed to fetch|timeout/i.test(msg)) {
    return "Network error. Please check your connection and try again.";
  }
  // Contract revert
  if (/revert|execution reverted/i.test(msg)) {
    const revertReason = msg.match(/reason[:\s]+(.+)/i);
    if (revertReason) return `Contract error: ${revertReason[1].trim()}`;
    return "Transaction reverted. You may already be registered or the referrer is invalid.";
  }

  // Truncate long messages
  return msg.length > 150 ? msg.slice(0, 150) + "..." : msg;
}

function RegisterForm() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [referrer, setReferrer] = useState(searchParams.get("ref") || "");
  const [error, setError] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Sync ref param from URL to state.
  // useState only captures the initial value — if useSearchParams() resolves
  // after the first render (client-side navigation from AuthGuard redirect,
  // hydration timing), the referrer would stay empty. This pattern adjusts
  // state during render (React-recommended) instead of using useEffect.
  const urlRef = searchParams.get("ref") || "";
  const [prevUrlRef, setPrevUrlRef] = useState(urlRef);
  if (urlRef && urlRef !== prevUrlRef) {
    setPrevUrlRef(urlRef);
    setReferrer(urlRef);
  }

  // USDT balance & allowance checks
  const { data: usdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  const { data: allowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: usdtABI,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.REFERRAL_REGISTRY] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address },
  });

  const hasEnoughBalance = usdtBalance !== undefined && usdtBalance >= REGISTRATION_FEE;
  const isApproved = allowance !== undefined && allowance >= REGISTRATION_FEE;

  // Approve flow
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveConfirmError,
  } = useWaitForTransactionReceipt({ hash: approveHash, chainId: bsc.id });

  // Register flow
  const {
    writeContract: writeRegister,
    data: registerHash,
    isPending: isRegisterPending,
    error: registerError,
  } = useWriteContract();

  const {
    isLoading: isRegisterConfirming,
    isSuccess: isRegisterSuccess,
    error: registerConfirmError,
  } = useWaitForTransactionReceipt({ hash: registerHash, chainId: bsc.id });

  // On-chain registration polling - fallback for mobile DApp browsers where
  // useWaitForTransactionReceipt may not fire reliably
  const { data: onChainRegistered } = useReadContract({
    address: CONTRACTS.REFERRAL_REGISTRY,
    abi: referralRegistryABI,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: {
      enabled: !!address && !!registerHash,
      refetchInterval: !!registerHash && !isRegisterSuccess ? 3000 : false,
    },
  });

  // Registration is confirmed if either the tx receipt says success OR on-chain polling confirms it
  const registrationConfirmed = isRegisterSuccess || onChainRegistered === true;

  // Track if we've already triggered the redirect to avoid double-firing
  const hasRedirected = useRef(false);

  // Consolidate all error sources (respect dismiss state)
  const activeError =
    approveError || approveConfirmError || registerError || registerConfirmError || null;
  const displayError = error || (activeError && !errorDismissed ? getCleanErrorMessage(activeError) : "");

  const resetErrors = useCallback(() => {
    setError("");
    setErrorDismissed(true);
  }, []);

  const isBusy = isApprovePending || isApproveConfirming || isRegisterPending || isRegisterConfirming;

  const executeRegister = useCallback(() => {
    const referrerArg = referrer
      ? (referrer as `0x${string}`)
      : "0x0000000000000000000000000000000000000000";

    writeRegister({
      address: CONTRACTS.REFERRAL_REGISTRY,
      abi: referralRegistryABI,
      functionName: "register",
      args: [referrerArg],
    });
  }, [referrer, writeRegister]);

  const handleRegister = () => {
    setError("");
    setErrorDismissed(false);

    if (!address) {
      setError("Please connect your wallet");
      return;
    }

    if (usdtBalance !== undefined && usdtBalance < REGISTRATION_FEE) {
      setError(`You need at least $1.00 USDT to register. Balance: $${formatUnits(usdtBalance, 18)}`);
      return;
    }

    if (referrer && !isAddress(referrer)) {
      setError("Invalid referrer address");
      return;
    }

    if (referrer && referrer.toLowerCase() === address.toLowerCase()) {
      setError("You cannot refer yourself");
      return;
    }

    if (isApproved) {
      executeRegister();
    } else {
      writeApprove({
        address: CONTRACTS.USDT,
        abi: usdtABI,
        functionName: "approve",
        args: [CONTRACTS.REFERRAL_REGISTRY, REGISTRATION_FEE],
      });
    }
  };

  // Auto-trigger register after approve confirms
  useEffect(() => {
    if (isApproveSuccess && !isRegisterPending && !isRegisterConfirming && !registerHash) {
      executeRegister();
    }
  }, [isApproveSuccess, isRegisterPending, isRegisterConfirming, registerHash, executeRegister]);

  // Redirect to dashboard on successful registration
  // Triggers from either tx receipt success OR on-chain polling confirmation
  useEffect(() => {
    if (registrationConfirmed && !hasRedirected.current) {
      hasRedirected.current = true;

      // Set sessionStorage flag so AuthGuard gives a grace period
      // and doesn't redirect back to /register before the RPC confirms
      try {
        sessionStorage.setItem("oslo_just_registered", Date.now().toString());
      } catch (e) {
        // sessionStorage might not be available in some DApp browsers
      }

      // Primary: Next.js router (clean SPA navigation)
      router.replace("/");

      // Fallback 1: force full page navigation after 1.5s if router hasn't worked
      const fallback1 = setTimeout(() => {
        window.location.href = "/";
      }, 1500);

      // Fallback 2: hard reload as last resort after 4s
      const fallback2 = setTimeout(() => {
        window.location.replace("/");
      }, 4000);

      return () => {
        clearTimeout(fallback1);
        clearTimeout(fallback2);
      };
    }
  }, [registrationConfirmed, router]);

  const getButtonText = () => {
    if (isApprovePending) return "Approve USDT in wallet...";
    if (isApproveConfirming) return "Confirming approval...";
    if (isRegisterPending) return "Sign registration...";
    if (isRegisterConfirming) return "Confirming registration...";
    if (isApproved) return "Register & Start Earning";
    return "Approve $1 USDT & Register";
  };

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Connect Your Wallet</h2>
          <p className="text-slate-500 mb-4">
            Please connect your wallet to register on Oslo Protocol
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-4 text-left">
            <p className="font-medium mb-1">Registration Fee: $1.00</p>
            <p>
              This charge does not go to corporate profits. It is transferred directly into the
              Liquidity Pool to maintain a healthy and robust environment for all participants.
            </p>
          </div>
          <div className="flex justify-center">
            <ConnectButton showBalance={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🚀</div>
          <h2 className="text-2xl font-bold text-slate-900">Join Oslo Protocol</h2>
          <p className="text-slate-500 mt-2">Register to start earning yield on your USDT</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Your Wallet
            </label>
            <div className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-500 font-mono break-all">
              {address}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Referral Address <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={referrer}
              onChange={(e) => {
                setReferrer(e.target.value);
                setError("");
              }}
              placeholder="0x... (who referred you?)"
              className="w-full bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Enter the wallet address of the person who invited you
            </p>
          </div>

          <div className="bg-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-slate-500 mb-1">
              <span>USDT Balance:</span>
              <span className={hasEnoughBalance ? "text-green-600" : "text-red-600"}>
                ${usdtBalance !== undefined ? formatUnits(usdtBalance, 18) : "--"}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Approval Status:</span>
              <span className={isApproved ? "text-green-600" : "text-amber-600"}>
                {isApproved ? "Approved" : "Approval required"}
              </span>
            </div>
          </div>

          {displayError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              <p>{displayError}</p>
              {!isBusy && (
                <button
                  onClick={() => {
                    resetErrors();
                    setError("");
                  }}
                  className="mt-2 text-xs text-red-600 underline hover:text-red-700"
                >
                  Dismiss &amp; Try Again
                </button>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p className="font-medium mb-1">Registration Fee: $1.00</p>
            <p>
              This charge does not go to corporate profits. It is transferred directly into the
              Liquidity Pool to maintain a healthy and robust environment for all participants.
            </p>
          </div>

          {/* Hide main action button once registration tx is submitted */}
          {(!registerHash || activeError) && (
            <button
              onClick={handleRegister}
              disabled={isBusy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors mt-4"
            >
              {getButtonText()}
            </button>
          )}

          {/* Show success + Go to Dashboard whenever register tx has been submitted */}
          {(registrationConfirmed || registerHash) && !activeError && (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-600 text-center">
                {registrationConfirmed
                  ? "✅ Registration successful! Redirecting to dashboard..."
                  : "⏳ Registration transaction submitted! Waiting for confirmation..."}
              </div>
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem("oslo_just_registered", Date.now().toString());
                  } catch (e) {}
                  window.location.href = "/";
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors text-sm"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {isBusy && (
            <p className="text-xs text-slate-400 text-center">
              {isApprovePending || isApproveConfirming
                ? "Step 1/2: Approve USDT spending"
                : "Step 2/2: Register your wallet"}
            </p>
          )}
        </div>

        <div className="mt-6 bg-slate-100 rounded-lg p-4 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-600 mb-2">What you get:</p>
          <p>• Access to Tier 1 (5.75%/week) and Tier 2 (7.70%/week) staking</p>
          <p>• 20-level referral income system</p>
          <p>• DAO governance eligibility</p>
          <p>• Your own unique referral link</p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><p className="text-slate-500">Loading...</p></div>}>
      <RegisterForm />
    </Suspense>
  );
}
