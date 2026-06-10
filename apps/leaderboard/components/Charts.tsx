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

function fmtAxisDate(t: number): string {
  return new Date(t).toISOString().slice(5, 10);
}

export function EquityChart({ points }: { points: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#222838" strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickFormatter={fmtAxisDate}
          stroke="#8b93a7"
          fontSize={11}
          minTickGap={40}
        />
        <YAxis stroke="#8b93a7" fontSize={11} domain={["auto", "auto"]} width={56} />
        <Tooltip
          contentStyle={{ background: "#131722", border: "1px solid #222838", color: "#e6e9ef" }}
          labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ")}
          formatter={(v: number) => [`${v.toFixed(2)} USDT`, "equity"]}
        />
        <Line type="monotone" dataKey="e" stroke="#16c784" dot={false} strokeWidth={1.6} />
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
        <CartesianGrid stroke="#222838" strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickFormatter={fmtAxisDate}
          stroke="#8b93a7"
          fontSize={11}
          minTickGap={40}
        />
        <YAxis stroke="#8b93a7" fontSize={11} width={56} unit="%" />
        <Tooltip
          contentStyle={{ background: "#131722", border: "1px solid #222838", color: "#e6e9ef" }}
          labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ")}
          formatter={(v: number) => [`${v.toFixed(2)}%`, "drawdown"]}
        />
        <Area type="monotone" dataKey="d" stroke="#ea3943" fill="#ea3943" fillOpacity={0.18} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
