// Fixed film-grain overlay. Pure CSS, no JS. A faint fractal-noise texture in overlay blend.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function FilmGrain() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 55,
        mixBlendMode: "overlay",
        backgroundImage: GRAIN,
        backgroundSize: "140px 140px",
        opacity: 0.06,
      }}
    />
  );
}
