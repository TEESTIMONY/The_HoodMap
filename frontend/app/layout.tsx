import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Display face — Clash Display (Indian Type Foundry, via Fontshare). Wide,
// heavy, geometric. Self-hosted variable font, weights 200–700.
const clashDisplay = localFont({
  src: "./fonts/ClashDisplay-Variable.woff2",
  variable: "--font-display",
  weight: "200 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HoodMap: the intelligence layer for Robinhood Chain",
  description:
    "Paste a token or wallet. See who really holds it, who's connected, and whether it's safe, and how any wallet has actually done. The intelligence layer for Robinhood Chain.",
  metadataBase: new URL("https://hoodmap.app"),
  openGraph: {
    title: "HoodMap: the intelligence layer for Robinhood Chain",
    description:
      "Paste a contract. See the wallets. Holder distribution, connected-wallet clusters, a safety grade, and full wallet trade history.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${clashDisplay.variable} ${GeistSans.variable} ${GeistMono.variable} dark`}
    >
      <body className="grain min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
