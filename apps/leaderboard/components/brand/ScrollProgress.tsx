"use client";

import { useEffect, useRef } from "react";

// A 2px progress bar pinned to the bottom of the viewport, scaling with scroll depth.
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight || 1;
      const p = Math.min(1, Math.max(0, (h.scrollTop || 0) / max));
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[58] h-0.5"
      style={{ background: "rgba(128,128,128,.18)" }}
    >
      <div
        ref={ref}
        className="h-full origin-left bg-white"
        style={{ mixBlendMode: "difference", transform: "scaleX(0)" }}
      />
    </div>
  );
}
