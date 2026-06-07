// Point-in-time technical indicators computed from candle history. These mirror the kind
// of features the Agent Hub technical-analysis skill derives from OHLCV, but computed
// locally and deterministically so they are safe to use inside a leak-free backtest (they
// only ever read the candles the engine already handed the agent). No look-ahead.

import type { Candle } from "@bitgetbench/core";

function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

/** Simple moving average of the last `period` closes, or null if not enough data. */
export function sma(candles: Candle[], period: number): number | null {
  if (period <= 0 || candles.length < period) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) sum += candles[i]!.close;
  return sum / period;
}

/** Full EMA series over a numeric array, seeded with the SMA of the first `period`. */
export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i]! * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Latest EMA of closes, or null if not enough data. */
export function ema(candles: Candle[], period: number): number | null {
  const series = emaSeries(closes(candles), period);
  return series.length > 0 ? series[series.length - 1]! : null;
}

/** Wilder RSI over `period`, in [0, 100], or null if not enough data. */
export function rsi(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  // Seed with the first `period` changes.
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const change = candles[i]!.close - candles[i - 1]!.close;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

/** MACD line, signal, and histogram, or null if not enough data. */
export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): Macd | null {
  if (candles.length < slow + signalPeriod) return null;
  const c = closes(candles);
  const fastEma = emaSeries(c, fast);
  const slowEma = emaSeries(c, slow);
  // Align the two EMA series by their tails (slow is shorter).
  const n = Math.min(fastEma.length, slowEma.length);
  const macdSeries: number[] = [];
  for (let i = 0; i < n; i += 1) {
    macdSeries.push(fastEma[fastEma.length - n + i]! - slowEma[slowEma.length - n + i]!);
  }
  const signalSeries = emaSeries(macdSeries, signalPeriod);
  if (signalSeries.length === 0) return null;
  const macdVal = macdSeries[macdSeries.length - 1]!;
  const signal = signalSeries[signalSeries.length - 1]!;
  return { macd: macdVal, signal, histogram: macdVal - signal };
}

/** Average true range over `period`, or null if not enough data. */
export function atr(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const cur = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    );
    sum += tr;
  }
  return sum / period;
}

/** Momentum: close now over close `period` bars ago, minus 1. Null if not enough data. */
export function momentum(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const now = candles[candles.length - 1]!.close;
  const then = candles[candles.length - 1 - period]!.close;
  return then !== 0 ? now / then - 1 : null;
}

export interface TechnicalSnapshot {
  close: number;
  sma20: number | null;
  sma50: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: Macd | null;
  atr14: number | null;
  momentum10: number | null;
}

/** A convenience snapshot of common indicators at the latest point-in-time bar. */
export function technicalFeatures(candles: Candle[]): TechnicalSnapshot {
  return {
    close: candles.length > 0 ? candles[candles.length - 1]!.close : NaN,
    sma20: sma(candles, 20),
    sma50: sma(candles, 50),
    ema12: ema(candles, 12),
    ema26: ema(candles, 26),
    rsi14: rsi(candles, 14),
    macd: macd(candles),
    atr14: atr(candles, 14),
    momentum10: momentum(candles, 10),
  };
}
