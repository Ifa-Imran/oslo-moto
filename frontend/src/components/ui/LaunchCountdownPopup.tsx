"use client";

import { useState, useEffect, useCallback } from "react";
import { Rocket, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "oslo_launch_target_ts";
const DISMISS_KEY = "oslo_launch_popup_dismissed";

/**
 * Returns the next 9 PM JST (Japan Standard Time = UTC+9) target timestamp in ms.
 * 9 PM JST = 12:00 UTC. If we're past today's 9 PM JST, returns tomorrow's.
 * Caches the computed target in localStorage so it persists across reloads.
 */
function getJST9PMTarget(): number {
  if (typeof window === "undefined") {
    // SSR fallback: compute fresh
    const now = new Date();
    const target = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      12, 0, 0, 0
    ));
    if (now.getTime() >= target.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.getTime();
  }

  const now = Date.now();
  const existing = window.localStorage.getItem(STORAGE_KEY);
  let cachedTarget = 0;
  if (existing) {
    const ts = parseInt(existing, 10);
    if (!isNaN(ts) && ts > 0) cachedTarget = ts;
  }

  // If cached target is still in the future, keep it
  if (cachedTarget > now) return cachedTarget;

  // Compute fresh next 9 PM JST target
  const nowDate = new Date();
  const target = new Date(Date.UTC(
    nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(),
    12, 0, 0, 0
  ));
  if (now >= target.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  window.localStorage.setItem(STORAGE_KEY, String(target.getTime()));
  return target.getTime();
}

function calculateTimeLeft(target: number) {
  const diff = target - Date.now();
  if (diff <= 0) return { h: 0, m: 0, s: 0, expired: true };
  return {
    h: Math.floor(diff / (1000 * 60 * 60)),
    m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    s: Math.floor((diff % (1000 * 60)) / 1000),
    expired: false,
  };
}

export function LaunchCountdownPopup() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(0);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0, expired: false });

  useEffect(() => {
    setMounted(true);
    const t = getJST9PMTarget();
    setTarget(t);
    setTimeLeft(calculateTimeLeft(t));

    // Show automatically unless permanently dismissed AND not expired
    const dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    const tl = calculateTimeLeft(t);
    if (!dismissed && !tl.expired) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      setTimeLeft(calculateTimeLeft(target));
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  const handleClose = () => {
    setOpen(false);
  };

  const handleDismissForever = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setOpen(false);
  };

  if (!mounted) return null;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-oslo-ice/10 via-oslo-void to-oslo-void border border-oslo-ice/30 shadow-[0_0_40px_rgba(127,196,255,0.25)] p-6 md:p-8"
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute top-3 right-3 p-1.5 rounded-full text-oslo-text-muted hover:text-oslo-text-primary hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hero icon */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-oslo-ice/30 blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-oslo-ice/20 to-oslo-ice/5 border border-oslo-ice/40 flex items-center justify-center">
                  <Rocket className="w-7 h-7 text-oslo-ice" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-oslo-ice/10 border border-oslo-ice/20 text-[10px] uppercase tracking-wider text-oslo-ice">
                <span className="w-1.5 h-1.5 rounded-full bg-oslo-ice animate-pulse" />
                Launching Soon
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-light tracking-tight text-center text-oslo-text-primary">
              OSLO Protocol Goes Live
            </h2>
            <p className="text-sm text-oslo-text-secondary text-center mt-2 mb-6">
              Every day at <strong className="text-oslo-ice">9 PM JST</strong> brings a new opportunity.
              Get ready to stake, earn, and grow with OSLO.
            </p>

            {/* Countdown */}
            {timeLeft.expired ? (
              <div className="rounded-xl bg-oslo-success/10 border border-oslo-success/30 p-5 text-center">
                <Rocket className="w-6 h-6 text-oslo-success mx-auto mb-2" />
                <p className="text-sm font-medium text-oslo-success">We&apos;re Live!</p>
                <p className="text-xs text-oslo-text-secondary mt-1">
                  OSLO Protocol has officially launched.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
                {[
                  { label: "Hours", value: pad(timeLeft.h) },
                  { label: "Minutes", value: pad(timeLeft.m) },
                  { label: "Seconds", value: pad(timeLeft.s) },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="rounded-xl bg-white/[0.03] border border-white/10 p-3 md:p-4 text-center"
                  >
                    <div className="text-3xl md:text-4xl font-mono font-light text-oslo-ice tabular-nums">
                      {unit.value}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-oslo-text-muted mt-1">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer note */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <Clock className="w-3.5 h-3.5 text-oslo-text-muted mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-oslo-text-muted leading-relaxed">
                Mark your calendar! Connect your wallet now to be among the first to register
                and unlock early adopter rewards on launch day.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-btn bg-oslo-ice/10 hover:bg-oslo-ice/20 border border-oslo-ice/30 text-sm text-oslo-ice transition-colors"
              >
                Got it
              </button>
              <button
                onClick={handleDismissForever}
                className="px-4 py-2.5 rounded-btn text-xs text-oslo-text-muted hover:text-oslo-text-secondary transition-colors"
              >
                Don&apos;t show again
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
