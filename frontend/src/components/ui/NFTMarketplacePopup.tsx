"use client";

import { useState, useEffect } from "react";
import { Sparkles, Gem, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Non-dismissable NFT Marketplace launch announcement popup.
 * Always visible — no close button, no escape key, no outside click dismiss.
 */
export function NFTMarketplacePopup() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          className="relative w-full max-w-lg rounded-2xl bg-gradient-to-br from-oslo-aurora/10 via-oslo-void to-oslo-void border border-oslo-aurora/30 shadow-[0_0_60px_rgba(124,58,237,0.3)] p-6 md:p-8 overflow-hidden"
        >
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-4 left-8 w-2 h-2 rounded-full bg-oslo-ice/40 animate-ping" />
            <div className="absolute top-12 right-12 w-1.5 h-1.5 rounded-full bg-oslo-aurora/50 animate-pulse" />
            <div className="absolute bottom-16 left-16 w-1 h-1 rounded-full bg-oslo-ice/30 animate-ping" style={{ animationDelay: "0.5s" }} />
            <div className="absolute bottom-8 right-8 w-2 h-2 rounded-full bg-oslo-aurora/40 animate-pulse" style={{ animationDelay: "1s" }} />
          </div>

          {/* Hero icon */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-oslo-aurora/30 blur-2xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-oslo-aurora/20 to-oslo-ice/10 border border-oslo-aurora/40 flex items-center justify-center">
                <Gem className="w-9 h-9 text-oslo-aurora" />
              </div>
            </div>
          </div>

          {/* Badge */}
          <div className="text-center mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-oslo-aurora/10 border border-oslo-aurora/20 text-[10px] uppercase tracking-wider text-oslo-aurora font-medium">
              <Sparkles className="w-3 h-3" />
              Coming Soon
            </span>
          </div>

          {/* Title */}
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center text-oslo-text-primary">
            NFT Marketplace
          </h2>
          <h3 className="text-lg md:text-xl font-light tracking-tight text-center text-oslo-aurora mt-1">
            is Launching!
          </h3>

          {/* Description */}
          <p className="text-sm text-oslo-text-secondary text-center mt-4 mb-6 max-w-sm mx-auto leading-relaxed">
            OSLO Protocol is launching its exclusive <strong className="text-oslo-aurora">NFT Marketplace</strong>. 
            Collect, trade, and own unique digital assets powered by BNB Smart Chain.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
            {[
              { icon: "🎨", label: "Unique\nCollections" },
              { icon: "⚡", label: "Low Gas\nFees" },
              { icon: "💎", label: "Exclusive\nDrops" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-white/[0.03] border border-white/10 p-3 md:p-4 text-center"
              >
                <div className="text-2xl mb-1">{item.icon}</div>
                <div className="text-[10px] uppercase tracking-wider text-oslo-text-muted whitespace-pre-line leading-tight">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-full p-3 rounded-xl bg-gradient-to-r from-oslo-aurora/10 to-oslo-ice/10 border border-oslo-aurora/20 text-center">
              <p className="text-xs text-oslo-text-secondary">
                Stay tuned for the official launch date.
              </p>
              <p className="text-sm font-medium text-oslo-text-primary mt-1">
                Follow us for exclusive early access!
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 mt-5">
            <div className="w-1.5 h-1.5 rounded-full bg-oslo-aurora animate-pulse" />
            <p className="text-[11px] text-oslo-text-muted">
              OSLO Protocol &mdash; Building the future of Web3
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
