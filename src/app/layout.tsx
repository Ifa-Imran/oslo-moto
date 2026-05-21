import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Background } from "@/components/layout/Background";
import { RegistrationGuard } from "@/components/RegistrationGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LaunchCountdownPopup } from "@/components/ui/LaunchCountdownPopup";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://oslo.finance";

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OSLO Protocol | Decentralized Investment Ecosystem",
    template: "%s | OSLO Protocol",
  },
  description:
    "Multi-tiered DeFi investment platform on BNB Smart Chain. Stake BUSD, earn daily yields up to 3X, build 20-level referral networks, and access DAO royalties.",
  keywords: [
    "OSLO Protocol",
    "DeFi",
    "staking",
    "BNB Smart Chain",
    "BSC",
    "yield farming",
    "referral rewards",
    "DAO",
    "crypto investment",
  ],
  authors: [{ name: "OSLO Protocol" }],
  creator: "OSLO Protocol",
  publisher: "OSLO Protocol",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "OSLO Protocol",
    title: "OSLO Protocol | Decentralized Investment Ecosystem",
    description:
      "Multi-tiered DeFi investment platform on BNB Smart Chain. Stake, earn yields, and build your referral network.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "OSLO Protocol",
    description:
      "DeFi investment platform on BNB Smart Chain. Stake, earn, refer.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-oslo-void text-oslo-text-primary antialiased overflow-x-hidden">
        <Providers>
          <ErrorBoundary>
            <Background />
            <Navbar />
            <Sidebar />
            <main className="pt-16 pb-20 lg:pb-0 lg:pl-[240px] min-h-screen">
              <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
                <RegistrationGuard>
                  {children}
                </RegistrationGuard>
              </div>
            </main>
            <BottomNav />
            <LaunchCountdownPopup />
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
