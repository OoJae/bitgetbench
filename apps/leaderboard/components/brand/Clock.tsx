"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

// Live UTC clock in the mono voice. Renders a stable placeholder until mounted.
export function Clock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<string>("--:--:-- UTC");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={`font-mono text-[11px] tracking-[0.12em] text-ink/50 ${className}`}>
      {now}
    </span>
  );
}
