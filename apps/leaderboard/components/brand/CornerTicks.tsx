import type { ReactNode } from "react";

// Frames a live object or chart with four corner ticks and an optional mono label.
export function CornerTicks({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const tick = "absolute h-3 w-3 border-ink/50";
  return (
    <div className={`relative border border-ink/15 ${className}`}>
      <span className={`${tick} left-2 top-2 border-l border-t`} />
      <span className={`${tick} right-2 top-2 border-r border-t`} />
      <span className={`${tick} bottom-2 left-2 border-b border-l`} />
      <span className={`${tick} bottom-2 right-2 border-b border-r`} />
      {label ? (
        <span className="absolute left-4 top-3 font-mono text-[10.5px] tracking-[0.12em] text-ink/50">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
