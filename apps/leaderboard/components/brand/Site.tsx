import Link from "next/link";
import { Clock } from "./Clock";

export const REPO_URL = "https://github.com/OoJae/bitgetbench";

function NavLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      className={`flex gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/72 ${className}`}
    >
      <Link href="/about" className="hover:text-ink">
        Method
      </Link>
      <Link href="/leaderboard" className="hover:text-ink">
        Leaderboard
      </Link>
      <a
        href={`${REPO_URL}#readme`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ink"
      >
        Docs
      </a>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
        GitHub ↗
      </a>
    </nav>
  );
}

// Slim header used on the inner pages (the landing hero carries its own top bar).
export function SiteHeader() {
  return (
    <header className="border-b border-ink/12">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <Link href="/" className="leading-tight">
          <div className="text-sm font-extrabold tracking-[0.02em]">BITGETBENCH</div>
          <Clock className="mt-1 block" />
        </Link>
        <NavLinks className="hidden sm:flex" />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-ink/12">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-7 font-mono text-[11px] uppercase tracking-[0.13em] text-ink/50">
        <span>BitgetBench - MIT - Built on Bitget Agent Hub</span>
        <NavLinks />
        <Clock />
      </div>
    </footer>
  );
}

// Standard inner-page shell: header, centered content, footer.
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
