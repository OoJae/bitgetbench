// Performance and risk metrics from an equity curve and trade list. Pure, deterministic,
// and defensive: every ratio guards divide-by-zero so a flat or degenerate curve yields
// zeros rather than NaN. Annualization uses the bar spacing (stepMs), so this module has
// no dependency on the data layer or any timeframe table.

import type { Metrics, EquitySample, Trade } from "./types.js";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export interface MetricsContext {
  /** Bar spacing in milliseconds, used to annualize Sharpe, Sortino, and volatility. */
  stepMs: number;
  /** Fraction of bars that held a position, 0..1. Supplied by the engine. */
  exposure: number;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n-1). Returns 0 for fewer than two points. */
function sampleStd(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** Downside deviation about a zero target, denominator = number of returns. */
function downsideDeviation(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) {
    const d = Math.min(x, 0);
    s += d * d;
  }
  return Math.sqrt(s / xs.length);
}

/** Per-bar simple returns from the equity curve. */
export function stepReturns(equityCurve: EquitySample[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const prev = equityCurve[i - 1]!.equity;
    const curr = equityCurve[i]!.equity;
    out.push(prev !== 0 ? curr / prev - 1 : 0);
  }
  return out;
}

/** Maximum peak-to-trough drawdown as a positive fraction (0..1). */
export function maxDrawdown(equityCurve: EquitySample[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const s of equityCurve) {
    if (s.equity > peak) peak = s.equity;
    if (peak > 0) {
      const dd = (peak - s.equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function computeMetrics(
  equityCurve: EquitySample[],
  trades: Trade[],
  ctx: MetricsContext,
): Metrics {
  const first = equityCurve[0]?.equity ?? 0;
  const last = equityCurve[equityCurve.length - 1]?.equity ?? first;
  const totalReturn = first !== 0 ? last / first - 1 : 0;

  const returns = stepReturns(equityCurve);
  const m = mean(returns);
  const sd = sampleStd(returns, m);
  const dd = downsideDeviation(returns);
  const periodsPerYear = MS_PER_YEAR / ctx.stepMs;
  const annualize = Math.sqrt(periodsPerYear);

  const volatility = sd * annualize;
  const sharpe = sd > 0 ? (m / sd) * annualize : 0;
  const sortino = dd > 0 ? (m / dd) * annualize : 0;

  const maxDd = maxDrawdown(equityCurve);

  const startTs = equityCurve[0]?.timestamp ?? 0;
  const endTs = equityCurve[equityCurve.length - 1]?.timestamp ?? startTs;
  const years = (endTs - startTs) / MS_PER_YEAR;
  let cagr: number;
  if (years > 0 && first > 0 && last > 0) {
    cagr = (last / first) ** (1 / years) - 1;
  } else {
    cagr = totalReturn;
  }
  const calmar = maxDd > 0 ? cagr / maxDd : 0;

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.pnlUsd >= 0) grossProfit += t.pnlUsd;
    else grossLoss += -t.pnlUsd;
  }
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  const expectancy = trades.length > 0 ? mean(trades.map((t) => t.pnlUsd)) : 0;

  return {
    totalReturn,
    cagr,
    sharpe,
    sortino,
    maxDrawdown: maxDd,
    calmar,
    winRate,
    profitFactor,
    expectancy,
    volatility,
    trades: trades.length,
    exposure: ctx.exposure,
  };
}
