// Telemetry ticker: items crawl slowly between hairlines. The content is doubled so the
// -50% translate loops seamlessly.
export function Ticker({ items }: { items: string[] }) {
  const sep = "  ·  ";
  const line = items.join(sep);
  return (
    <div className="overflow-hidden border-y border-ink/12 py-2.5">
      <div className="inline-block whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.16em] text-ink/60 animate-ticker">
        <span>
          {line}
          {sep}
          {line}
          {sep}
        </span>
      </div>
    </div>
  );
}
