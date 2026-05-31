"use client";

import { useState, useEffect } from "react";
import { Rocket, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LAUNCH_HOURS = 12;
const LAUNCH_DURATION_MS = LAUNCH_HOURS * 60 * 60 * 1000;
const STORAGE_KEY = "oslo_launch_target_ts_v3";

/**
 * Returns the launch target timestamp (ms).
 * On first visit, anchors a target 12 hours from now and stores it in localStorage
 * so the countdown is consistent across reloads for the same browser.
 */
function getLaunchTarget(): number {
  if (typeof window === "undefined") return Date.now() + LAUNCH_DURATION_MS;
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    const ts = parseInt(existing, 10);
    if (!isNaN(ts) && ts > 0) return ts;
  }
  const target = Date.now() + LAUNCH_DURATION_MS;
  window.localStorage.setItem(STORAGE_KEY, String(target));
  return target;
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
    const t = getLaunchTarget();
    setTarget(t);
    const tl = calculateTimeLeft(t);
    setTimeLeft(tl);

    // Always show if not expired — undismissable
    if (!tl.expired) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const tl = calculateTimeLeft(target);
      setTimeLeft(tl);
      // Auto-dismiss when expired
      if (tl.expired) {
        setOpen(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

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
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-oslo-ice/10 via-oslo-void to-oslo-void border border-oslo-ice/30 shadow-[0_0_40px_rgba(127,196,255,0.25)] p-6 md:p-8"
          >
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
              The official launch is just <strong className="text-oslo-ice">{LAUNCH_HOURS} hours</strong> away.
              Get ready to stake, earn, and grow with OSLO.
            </p>

            {/* Countdown */}
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

            {/* Footer note */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <Clock className="w-3.5 h-3.5 text-oslo-text-muted mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-oslo-text-muted leading-relaxed">
                Mark your calendar! Connect your wallet now to be among the first to register
                and unlock early adopter rewards on launch day.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
