import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "oslo-void": "#05070a",
        "oslo-base": "#0a0f17",
        "oslo-elevated": "#111827",
        "oslo-floating": "#1a2332",
        "oslo-ice": "#00e5ff",
        "oslo-ice-dim": "rgba(0, 229, 255, 0.1)",
        "oslo-ice-glow": "rgba(0, 229, 255, 0.4)",
        "oslo-aurora": "#7c3aed",
        "oslo-aurora-dim": "rgba(124, 58, 237, 0.1)",
        "oslo-success": "#10b981",
        "oslo-warning": "#f59e0b",
        "oslo-danger": "#ef4444",
        "oslo-danger-dim": "rgba(239, 68, 68, 0.1)",
        "oslo-text-primary": "#f8fafc",
        "oslo-text-secondary": "#94a3b8",
        "oslo-text-muted": "#475569",
        "oslo-text-ice": "#00e5ff",
      },
      fontFamily: {
        sans: ["Inter", "Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      borderRadius: {
        card: "12px",
        btn: "8px",
        modal: "16px",
      },
      boxShadow: {
        "oslo-card":
          "0 0 0 1px rgba(0,229,255,0.1), 0 4px 24px rgba(0,0,0,0.4)",
        "oslo-glow": "0 0 24px rgba(0,229,255,0.15)",
        "oslo-aurora-glow": "0 0 24px rgba(124,58,237,0.15)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
