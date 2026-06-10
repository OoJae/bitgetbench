import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BitgetBench Leaderboard",
  description: "Leak-free evaluation and paper-trading leaderboard for Bitget Agent Hub agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-edge">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              Bitget<span className="text-accent">Bench</span>
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-ink">
                Leaderboard
              </Link>
              <Link href="/about" className="hover:text-ink">
                Methodology
              </Link>
              <a href="/api/stats" className="hover:text-ink">
                API
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">
          Sim only. No real capital. Public Bitget market data. MIT licensed.
        </footer>
      </body>
    </html>
  );
}
