// A tiny equity sparkline as an inline SVG polyline. Pure server component, no chart lib.

export interface SparkPoint {
  t: number;
  e: number;
}

export function SparkLine({
  points,
  width = 100,
  height = 26,
  dashed = false,
  tone = "auto",
}: {
  points: SparkPoint[];
  width?: number;
  height?: number;
  dashed?: boolean;
  /** "auto" colors by net direction (last vs first); "neutral" keeps the monochrome ink line. */
  tone?: "auto" | "neutral";
}) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const ys = points.map((p) => p.e);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pad = 2;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = pad + (1 - (p.e - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // Color by net direction (equity end vs start), the one P&L exception to the monochrome brand.
  const up = points[points.length - 1]!.e >= points[0]!.e;
  const stroke = dashed
    ? "rgba(244,244,242,.45)"
    : tone === "neutral"
      ? "#F4F4F2"
      : up
        ? "#34D399"
        : "#F87171";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
    >
      <polyline
        points={coords.join(" ")}
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray={dashed ? "3 3" : undefined}
      />
    </svg>
  );
}
