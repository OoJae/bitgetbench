"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface Point {
  t: number;
  e: number;
}

// Monochrome brand palette.
const INK = "#F4F4F2";
const HAIR = "rgba(244,244,242,.12)";
const ASH = "rgba(244,244,242,.45)";
const PANEL = "#0E0E0E";

function fmtAxisDate(t: number): string {
  return new Date(t).toISOString().slice(5, 10);
}

const tooltip = {
  contentStyle: { background: PANEL, border: `1px solid ${HAIR}`, color: INK },
};

export function EquityChart({ points }: { points: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={HAIR} strokeDasharray="3 3" />
        <XAxis dataKey="t" tickFormatter={fmtAxisDate} stroke={ASH} fontSize={11} minTickGap={40} />
        <YAxis stroke={ASH} fontSize={11} domain={["auto", "auto"]} width={56} />
        <Tooltip
          {...tooltip}
          labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ")}
          formatter={(v: number) => [`${v.toFixed(2)} USDT`, "equity"]}
        />
        <Line type="monotone" dataKey="e" stroke={INK} dot={false} strokeWidth={1.6} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ points }: { points: Point[] }) {
  let peak = -Infinity;
  const dd = points.map((p) => {
    if (p.e > peak) peak = p.e;
    return { t: p.t, d: peak > 0 ? -((peak - p.e) / peak) * 100 : 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={dd} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={HAIR} strokeDasharray="3 3" />
        <XAxis dataKey="t" tickFormatter={fmtAxisDate} stroke={ASH} fontSize={11} minTickGap={40} />
        <YAxis stroke={ASH} fontSize={11} width={56} unit="%" />
        <Tooltip
          {...tooltip}
          labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ")}
          formatter={(v: number) => [`${v.toFixed(2)}%`, "drawdown"]}
        />
        <Area type="monotone" dataKey="d" stroke={ASH} fill={INK} fillOpacity={0.08} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
