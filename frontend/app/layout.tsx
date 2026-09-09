import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoodMap — Robinhood Chain wallet intelligence",
  description:
    "Paste a token or wallet. See who really holds it, who's connected, and whether it's safe. On-chain intelligence for Robinhood Chain.",
  metadataBase: new URL("https://hoodmap.app"),
  openGraph: {
    title: "HoodMap — Robinhood Chain wallet intelligence",
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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="grain min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
