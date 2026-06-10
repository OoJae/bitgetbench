// Live candle poller for the paper-sandbox. It fetches the most recent CLOSED candles from
// Bitget and appends them to the cache (immutable, append-only), filling any gap since the
// last cached bar. The sandbox runner then re-runs agents over the live-updated window.

import type { Candle } from "@bitgetbench/core";
import { fetchCandleRange, type BitgetConfig } from "./bitgetFetch.js";
import { writeCandles, readManifest, DEFAULT_CACHE_DIR, type CacheKey } from "./cache.js";
import { timeframeToMs, alignDown } from "./timeframe.js";
import { DEFAULT_MARKET } from "./dataset.js";

export interface LivePoller {
  /** Fetch the latest fully closed candle for the symbol/timeframe, or null if none. */
  pollLatestClosed(symbol: string, timeframe: string): Promise<Candle | null>;
}

export interface SyncParams {
  symbol: string;
  timeframe: string;
  market?: string;
  cacheDir?: string;
  config?: Partial<BitgetConfig>;
  fetchImpl?: typeof fetch;
  onRequest?: () => void;
  /** Number of recent bars to fetch when the cache is empty. Default 20. */
  bootstrapBars?: number;
  /** Wall-clock now, injectable for tests. */
  now?: number;
}

export interface SyncResult {
  appended: number;
  latest: Candle | null;
  rows: number;
}

/**
 * Append newly closed candles to the cache, filling the gap from the last cached bar to the
 * latest closed bar. A bar is closed when openTime + step <= now.
 */
export async function syncRecentCandles(params: SyncParams): Promise<SyncResult> {
  const step = timeframeToMs(params.timeframe);
  const now = params.now ?? Date.now();
  // The most recent fully closed bar opens one step before the current bar.
  const lastClosedOpen = alignDown(now, params.timeframe) - step;
  const market = params.market ?? DEFAULT_MARKET;
  const key: CacheKey = { market, symbol: params.symbol, timeframe: params.timeframe };
  const cacheDir = params.cacheDir ?? DEFAULT_CACHE_DIR;

  const manifest = readManifest(key, cacheDir);
  const bootstrap = params.bootstrapBars ?? 20;
  const startMs =
    manifest && manifest.lastOpenTime !== null
      ? manifest.lastOpenTime + step
      : lastClosedOpen - bootstrap * step;
  // endMs is exclusive in fetchCandleRange, so add a step to include lastClosedOpen.
  const endMs = lastClosedOpen + step;

  if (startMs > lastClosedOpen) {
    // Already up to date.
    return { appended: 0, latest: null, rows: manifest?.rows ?? 0 };
  }

  const fetched = await fetchCandleRange({
    symbol: params.symbol,
    timeframe: params.timeframe,
    startMs,
    endMs,
    ...(params.config ? { config: params.config } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
    ...(params.onRequest ? { onRequest: params.onRequest } : {}),
  });
  const closed = fetched.filter((c) => c.openTime + step <= now);
  const written = writeCandles(key, closed, cacheDir);
  const beforeRows = manifest?.rows ?? 0;
  return {
    appended: written.rows - beforeRows,
    latest: closed.length > 0 ? closed[closed.length - 1]! : null,
    rows: written.rows,
  };
}
