export function LeakBadge({ clean }: { clean: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium " +
        (clean ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger")
      }
      title={clean ? "Point-in-time verified, no look-ahead" : "Leak detected"}
    >
      {clean ? "leak-free" : "leak"}
    </span>
  );
}

export function LabelTag({ label }: { label: string }) {
  return (
    <span className="rounded bg-edge px-1.5 py-0.5 text-xs text-muted" title={`${label} agent`}>
      {label}
    </span>
  );
}
