import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { WrongChainBanner } from "@/components/WrongChainBanner";

const DESCRIPTION =
  "Minimal intent-based escrow with EIP-712 signature verification. ETH and ERC-20, ERC-1271 smart-wallet beneficiaries, gasless accept-and-release intents. Sepolia testnet.";

export const metadata: Metadata = {
  title: {
    default: "Intent Escrow",
    template: "%s · Intent Escrow",
  },
  description: DESCRIPTION,
  applicationName: "Intent Escrow",
  openGraph: {
    title: "Intent Escrow",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Intent Escrow",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <header className="border-b border-edge">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link href="/" className="font-mono text-lg font-semibold">
                intent<span className="text-accent">.escrow</span>
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/how-it-works" className="text-muted hover:text-white">
                  How it works
                </Link>
                <Link href="/create" className="text-muted hover:text-white">
                  Create
                </Link>
                <Link href="/escrows" className="text-muted hover:text-white">
                  Escrows
                </Link>
                <ConnectButton />
              </nav>
            </div>
          </header>
          <WrongChainBanner />
          <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
          <footer className="border-t border-edge mt-16">
            <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-muted flex items-center justify-between">
              <span>Sepolia testnet · not audited · do not use with real value.</span>
              <a
                className="hover:text-white"
                href="https://github.com/sp0oby/intent-escrow"
                target="_blank"
                rel="noreferrer"
              >
                source
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
