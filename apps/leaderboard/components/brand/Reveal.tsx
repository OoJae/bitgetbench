"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Reveal-on-enter: content rises and fades in once it scrolls into view. Renders visible if
// JS never runs (progressive enhancement); the hidden state is only applied after mount.
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(true);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden = armed && !shown;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? "translateY(28px)" : "none",
        transition: "opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1)",
      }}
    >
      {children}
    </Tag>
  );
}
