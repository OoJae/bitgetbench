import Link from "next/link";
import type { ReactNode } from "react";

// Bracket-wrapped kicker, mono uppercase. "[ The open trust layer ]"
export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50 ${className}`}>
      [ {children} ]
    </span>
  );
}

// Section index label, mono uppercase. "01 / The problem"
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">{children}</div>
  );
}

// Blinking status dot (never color), with a mono label.
export function LiveDot({ label = "LIVE", ok = true }: { label?: string; ok?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-ink/60">
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full " + (ok ? "bg-ink animate-blink" : "bg-ink/40")
        }
      />
      {label}
    </span>
  );
}

// Leak certificate tag. Monochrome: a checkmark when clean, a struck label when not.
export function LeakTag({ clean }: { clean: boolean }) {
  return (
    <span
      className="font-mono text-[11px] tracking-[0.1em] text-ink/70"
      title={clean ? "Point-in-time verified, no look-ahead" : "Leak detected"}
    >
      {clean ? "✓ LEAK-CLEAN" : "✗ LEAK"}
    </span>
  );
}

// Verification tier badge. Honest provenance, never color:
// - engine-verified: our engine ran the decision logic on leak-clean data (fully re-runnable)
// - data-clean: we fed only point-in-time data, but the external agent is unverified
// - disqualified: a look-ahead violation in the data we fed (scores 0)
export function TierTag({
  tier,
  compact = false,
}: {
  tier: string | undefined;
  compact?: boolean;
}) {
  const map: Record<string, { short: string; full: string; title: string }> = {
    "engine-verified": {
      short: "✓ ENGINE",
      full: "✓ ENGINE-VERIFIED",
      title: "Leak-clean and run in the BitgetBench engine. Fully re-runnable.",
    },
    "data-clean": {
      short: "◷ DATA-CLEAN",
      full: "◷ DATA POINT-IN-TIME / AGENT UNVERIFIED",
      title:
        "BitgetBench fed only point-in-time data. The agent is externally hosted and cannot be fully verified.",
    },
    disqualified: {
      short: "✗ LEAK",
      full: "✗ LEAK DETECTED",
      title: "A look-ahead violation in the data we fed. This run scores 0.",
    },
  };
  const m = map[tier ?? "engine-verified"] ?? map["engine-verified"]!;
  return (
    <span className="font-mono text-[11px] tracking-[0.1em] text-ink/70" title={m.title}>
      {compact ? m.short : m.full}
    </span>
  );
}

// Small mono tag for the agent kind (local / strategy-spec / remote-webhook).
export function KindTag({ kind }: { kind: string | undefined }) {
  if (!kind || kind === "local") return null;
  const label = kind === "remote-webhook" ? "remote" : "spec";
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/40">{label}</span>
  );
}

// A command shown verbatim in a pill with a dim prompt glyph.
export function CodeChip({ command, className = "" }: { command: string; className?: string }) {
  return (
    <span
      className={
        "inline-flex w-max max-w-full items-center gap-3 rounded-full border border-ink/25 px-5 py-3 font-mono text-[13px] " +
        className
      }
    >
      <span className="text-ink/45">$</span>
      <span className="truncate">{command}</span>
    </span>
  );
}

// Pill button. Primary = solid ink on void; secondary = hairline outline.
export function PillButton({
  href,
  children,
  variant = "primary",
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-2 rounded-full px-6 py-3 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors " +
    (variant === "primary"
      ? "bg-ink text-void hover:bg-bone"
      : "border border-ink/28 text-ink hover:border-ink/60");
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
