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
}: {
  points: SparkPoint[];
  width?: number;
  height?: number;
  dashed?: boolean;
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
        stroke={dashed ? "rgba(244,244,242,.45)" : "#F4F4F2"}
        strokeWidth="1.5"
        strokeDasharray={dashed ? "3 3" : undefined}
      />
    </svg>
  );
}
