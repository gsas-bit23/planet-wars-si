import type { Metadata, Viewport } from "next";
import { Syne, Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NetworkBanner } from "@/components/layout/network-banner";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["600", "700", "800"] });
const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", weight: ["400", "500"] });
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument", weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Planet Wars SI — Take back the solar system", template: "%s · Planet Wars SI" },
  description:
    "A rogue superintelligence has taken over the solar system. Claim territory plots on all eight planets, fortify them, trade them and defend them — on Robinhood Chain testnet.",
  openGraph: {
    title: "Planet Wars SI",
    description: "A rogue superintelligence owns the solar system. Take it back, one plot at a time.",
    images: ["/og.jpg"],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#04050a", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${inter.variable} ${mono.variable} ${serif.variable}`}>
      <body className="grain min-h-dvh overflow-x-hidden">
        <Providers>
          <SiteHeader />
          <NetworkBanner />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
