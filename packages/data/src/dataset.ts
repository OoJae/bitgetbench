// High-level convenience: fetch a date range from Bitget and persist it to the cache in
// one call. Thin wrapper over fetchCandleRange + writeCandles so callers (the smoke
// script, later the CLI) do not repeat the wiring.

import { fetchCandleRange, BITGET_CONFIG, type BitgetConfig } from "./bitgetFetch.js";
import { writeCandles, DEFAULT_CACHE_DIR, type CacheManifest } from "./cache.js";

/** Default market label for v1: USDT-M futures. Used as the cache directory segment. */
export const DEFAULT_MARKET = "usdt-futures";

export interface FetchAndCacheParams {
  symbol: string;
  timeframe: string;
  startMs: number;
  endMs: number;
  market?: string;
  cacheDir?: string;
  config?: Partial<BitgetConfig>;
  fetchImpl?: typeof fetch;
  onRequest?: () => void;
}

export async function fetchAndCacheRange(params: FetchAndCacheParams): Promise<CacheManifest> {
  const candles = await fetchCandleRange({
    symbol: params.symbol,
    timeframe: params.timeframe,
    startMs: params.startMs,
    endMs: params.endMs,
    ...(params.config ? { config: params.config } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
    ...(params.onRequest ? { onRequest: params.onRequest } : {}),
  });
  return writeCandles(
    {
      market: params.market ?? DEFAULT_MARKET,
      symbol: params.symbol,
      timeframe: params.timeframe,
    },
    candles,
    params.cacheDir ?? DEFAULT_CACHE_DIR,
  );
}

export { BITGET_CONFIG };
