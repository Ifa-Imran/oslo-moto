import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Web3Provider } from "@/components/web3/Web3Provider";
import { Navbar } from "@/components/web3/Navbar";
import { BottomNav } from "@/components/web3/BottomNav";
import { AuthGuard } from "@/components/web3/AuthGuard";
import { Toaster } from "react-hot-toast";

// Force dynamic rendering to prevent ISR caching (s-maxage=31536000)
// This ensures users always get fresh HTML, not a year-old cached version
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
};

export const metadata: Metadata = {
  title: "Oslo Protocol - DeFi Investment Platform",
  description: "Stake USDT, earn OSLO. Deflationary DeFi protocol on BSC.",
  other: {
    "cache-control": "no-cache, no-store, must-revalidate",
    pragma: "no-cache",
    expires: "0",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white min-h-screen">
        <Web3Provider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            <AuthGuard>{children}</AuthGuard>
          </main>
          <BottomNav />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1f2937",
                color: "#fff",
                border: "1px solid #374151",
              },
            }}
          />
        </Web3Provider>
      </body>
    </html>
  );
}
