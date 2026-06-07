// Local candle cache. One NDJSON file per (market, symbol, timeframe) plus a manifest
// with coverage range, row count, and a sha256 of the NDJSON content. Candles are
// immutable once closed: writes merge, dedupe by openTime, and re-sort ascending, so a
// reload is always deterministic and byte-identical for the same input set.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Candle } from "@bitgetbench/core";

const HERE = dirname(fileURLToPath(import.meta.url));
// Default cache lives at repo-root/data-cache (gitignored). From packages/data/src this
// is four levels up. Override with an explicit cacheDir argument when needed.
export const DEFAULT_CACHE_DIR = join(HERE, "..", "..", "..", "data-cache");

export interface CacheKey {
  market: string;
  symbol: string;
  timeframe: string;
}

export interface CacheManifest {
  market: string;
  symbol: string;
  timeframe: string;
  rows: number;
  firstOpenTime: number | null;
  lastOpenTime: number | null;
  sha256: string;
  updatedAt: string;
}

export interface CachePaths {
  dir: string;
  ndjson: string;
  manifest: string;
}

export function cachePaths(key: CacheKey, cacheDir: string = DEFAULT_CACHE_DIR): CachePaths {
  const dir = join(cacheDir, key.market, key.symbol, key.timeframe);
  return {
    dir,
    ndjson: join(dir, "candles.ndjson"),
    manifest: join(dir, "manifest.json"),
  };
}

/** Serialize one candle with a fixed key order so output is byte-stable. */
function serializeCandle(c: Candle): string {
  return JSON.stringify({
    openTime: c.openTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  });
}

/** Render a candle set as deterministic NDJSON: ascending by openTime, one per line. */
export function toNdjson(candles: Candle[]): string {
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);
  if (sorted.length === 0) return "";
  return sorted.map(serializeCandle).join("\n") + "\n";
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Parse NDJSON text back into candles. Blank lines are ignored. */
export function parseNdjson(text: string): Candle[] {
  const out: Candle[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(JSON.parse(trimmed) as Candle);
  }
  return out;
}

export function readCachedCandles(key: CacheKey, cacheDir: string = DEFAULT_CACHE_DIR): Candle[] {
  const { ndjson } = cachePaths(key, cacheDir);
  if (!existsSync(ndjson)) return [];
  return parseNdjson(readFileSync(ndjson, "utf8"));
}

export function readManifest(
  key: CacheKey,
  cacheDir: string = DEFAULT_CACHE_DIR,
): CacheManifest | null {
  const { manifest } = cachePaths(key, cacheDir);
  if (!existsSync(manifest)) return null;
  return JSON.parse(readFileSync(manifest, "utf8")) as CacheManifest;
}

/** Merge candles by openTime (incoming wins on collision); keep ascending and unique. */
export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  const byOpenTime = new Map<number, Candle>();
  for (const c of existing) byOpenTime.set(c.openTime, c);
  for (const c of incoming) byOpenTime.set(c.openTime, c);
  return [...byOpenTime.values()].sort((a, b) => a.openTime - b.openTime);
}

/**
 * Merge new candles into the cache and write NDJSON + manifest atomically enough for our
 * purposes. Returns the manifest. Appending the same candles is idempotent.
 */
export function writeCandles(
  key: CacheKey,
  incoming: Candle[],
  cacheDir: string = DEFAULT_CACHE_DIR,
): CacheManifest {
  const paths = cachePaths(key, cacheDir);
  mkdirSync(paths.dir, { recursive: true });

  const merged = mergeCandles(readCachedCandles(key, cacheDir), incoming);
  const ndjson = toNdjson(merged);
  writeFileSync(paths.ndjson, ndjson, "utf8");

  const manifest: CacheManifest = {
    market: key.market,
    symbol: key.symbol,
    timeframe: key.timeframe,
    rows: merged.length,
    firstOpenTime: merged.length > 0 ? merged[0]!.openTime : null,
    lastOpenTime: merged.length > 0 ? merged[merged.length - 1]!.openTime : null,
    sha256: sha256(ndjson),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}
