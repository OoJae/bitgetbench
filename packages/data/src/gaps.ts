// Gap detection over a cached candle series. A gap is any pair of consecutive candles
// whose openTime difference is not exactly one bar. Used by the smoke report and (later)
// to decide whether a backtest window is dense enough to trust.

import type { Candle } from "@bitgetbench/core";
import { timeframeToMs } from "./timeframe.js";

export interface Gap {
  afterOpenTime: number;
  beforeOpenTime: number;
  missingBars: number;
}

export function findGaps(candles: Candle[], timeframe: string): Gap[] {
  const step = timeframeToMs(timeframe);
  const gaps: Gap[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1]!.openTime;
    const curr = candles[i]!.openTime;
    const delta = curr - prev;
    if (delta !== step) {
      gaps.push({
        afterOpenTime: prev,
        beforeOpenTime: curr,
        missingBars: Math.round(delta / step) - 1,
      });
    }
  }
  return gaps;
}
