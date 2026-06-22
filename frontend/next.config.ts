import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.1.2", "192.168.1.4", "localhost"],
  turbopack: {
    root: ".",
  },
  async headers() {
    return [
      {
        // HTML pages: prevent caching so users always get fresh HTML
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
