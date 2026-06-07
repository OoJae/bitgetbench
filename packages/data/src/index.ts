// Public surface of @bitgetbench/data: Bitget candle fetch, local cache, and the
// point-in-time reader (the single chokepoint against look-ahead bias).

export {
  fetchCandleRange,
  BITGET_CONFIG,
  type BitgetConfig,
  type FetchRangeParams,
} from "./bitgetFetch.js";

export {
  cachePaths,
  readCachedCandles,
  readManifest,
  writeCandles,
  mergeCandles,
  toNdjson,
  parseNdjson,
  sha256,
  DEFAULT_CACHE_DIR,
  type CacheKey,
  type CacheManifest,
  type CachePaths,
} from "./cache.js";

export { InMemoryPointInTimeReader, readerFromCache, countUpTo } from "./reader.js";

export { findGaps, type Gap } from "./gaps.js";

export { fetchAndCacheRange, DEFAULT_MARKET, type FetchAndCacheParams } from "./dataset.js";

export { type LivePoller } from "./poller.js";

export { timeframeToMs, toBitgetGranularity, supportedTimeframes, alignDown } from "./timeframe.js";
