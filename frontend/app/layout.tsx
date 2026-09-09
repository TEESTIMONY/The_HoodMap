import type { Metadata } from "next";
import { Gruppo } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Display face — thin, wide, geometric (matches the brand-sheet headline feel).
const gruppo = Gruppo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${gruppo.variable} ${GeistSans.variable} ${GeistMono.variable} dark`}
    >
      <body className="grain min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
