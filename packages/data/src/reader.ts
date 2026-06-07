// The point-in-time reader: the single chokepoint that prevents look-ahead bias.
// getCandlesUpTo returns ONLY candles with openTime <= ts (boundary included), ascending.
// The replay loop must read candles through this and nothing else (hard rule 4).

import type { Candle, PointInTimeReader, PointInTimeQueryOptions } from "@bitgetbench/core";
import { readCachedCandles, DEFAULT_CACHE_DIR, type CacheKey } from "./cache.js";

function seriesId(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

/**
 * Count of candles with openTime <= ts in an ascending-sorted series. Binary search,
 * so reads stay cheap even on a full multi-month series. Returns the prefix length.
 */
export function countUpTo(candles: Candle[], ts: number): number {
  let lo = 0;
  let hi = candles.length; // first index strictly after ts
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid]!.openTime <= ts) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * A reader backed by in-memory candle series. Construct directly from data (tests) or
 * via fromCache (real runs). Each series must be ascending by openTime; the constructor
 * verifies this so a mis-sorted cache fails loudly rather than leaking silently.
 */
export class InMemoryPointInTimeReader implements PointInTimeReader {
  private readonly series = new Map<string, Candle[]>();

  constructor(initial?: Map<string, Candle[]>) {
    if (initial) {
      for (const [id, candles] of initial) this.setSeries(id, candles);
    }
  }

  /** Register a series under "SYMBOL|timeframe". Asserts ascending, unique openTimes. */
  setSeries(id: string, candles: Candle[]): void {
    for (let i = 1; i < candles.length; i += 1) {
      if (candles[i]!.openTime <= candles[i - 1]!.openTime) {
        throw new Error(
          `Series "${id}" is not strictly ascending at index ${i} ` +
            `(openTime ${candles[i]!.openTime} <= ${candles[i - 1]!.openTime}).`,
        );
      }
    }
    this.series.set(id, candles);
  }

  add(symbol: string, timeframe: string, candles: Candle[]): void {
    this.setSeries(seriesId(symbol, timeframe), candles);
  }

  getCandlesUpTo(
    symbol: string,
    timeframe: string,
    ts: number,
    opts?: PointInTimeQueryOptions,
  ): Candle[] {
    const candles = this.series.get(seriesId(symbol, timeframe));
    if (!candles) return [];
    const end = countUpTo(candles, ts);
    const lookback = opts?.lookback;
    const start = lookback !== undefined && lookback >= 0 ? Math.max(0, end - lookback) : 0;
    return candles.slice(start, end);
  }
}

/** Build a reader from the local cache for one (market, symbol, timeframe). */
export function readerFromCache(
  key: CacheKey,
  cacheDir: string = DEFAULT_CACHE_DIR,
): InMemoryPointInTimeReader {
  const reader = new InMemoryPointInTimeReader();
  reader.add(key.symbol, key.timeframe, readCachedCandles(key, cacheDir));
  return reader;
}
