// Unit tests for the candle cache: deterministic serialization, dedupe/sort on merge,
// and idempotent writes (the same candles never change the on-disk sha256).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Candle } from "@bitgetbench/core";
import {
  mergeCandles,
  toNdjson,
  parseNdjson,
  writeCandles,
  readCachedCandles,
  readManifest,
  type CacheKey,
} from "../src/index.js";

function c(openTime: number, close: number): Candle {
  return { openTime, open: close, high: close, low: close, close, volume: 1 };
}

const KEY: CacheKey = { market: "usdt-futures", symbol: "BTCUSDT", timeframe: "15m" };

describe("mergeCandles", () => {
  it("dedupes by openTime and sorts ascending, with incoming winning collisions", () => {
    const merged = mergeCandles([c(30, 1), c(10, 1)], [c(20, 1), c(10, 99)]);
    expect(merged.map((x) => x.openTime)).toEqual([10, 20, 30]);
    expect(merged[0]!.close).toBe(99);
  });
});

describe("toNdjson / parseNdjson", () => {
  it("round-trips and is order-independent (sorts on serialize)", () => {
    const a = toNdjson([c(20, 2), c(10, 1)]);
    const b = toNdjson([c(10, 1), c(20, 2)]);
    expect(a).toBe(b);
    expect(parseNdjson(a)).toEqual([c(10, 1), c(20, 2)]);
  });

  it("emits empty string for no candles", () => {
    expect(toNdjson([])).toBe("");
  });
});

describe("writeCandles", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bgb-cache-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists candles and a manifest, and reload matches", () => {
    const m = writeCandles(KEY, [c(20, 2), c(10, 1), c(30, 3)], dir);
    expect(m.rows).toBe(3);
    expect(m.firstOpenTime).toBe(10);
    expect(m.lastOpenTime).toBe(30);
    expect(readCachedCandles(KEY, dir)).toEqual([c(10, 1), c(20, 2), c(30, 3)]);
    expect(readManifest(KEY, dir)?.sha256).toBe(m.sha256);
  });

  it("is idempotent: writing the same candles twice keeps the same sha256 and rows", () => {
    const m1 = writeCandles(KEY, [c(10, 1), c(20, 2)], dir);
    const m2 = writeCandles(KEY, [c(20, 2), c(10, 1)], dir);
    expect(m2.sha256).toBe(m1.sha256);
    expect(m2.rows).toBe(m1.rows);
  });

  it("appends new candles and dedupes overlaps", () => {
    writeCandles(KEY, [c(10, 1), c(20, 2)], dir);
    const m = writeCandles(KEY, [c(20, 2), c(30, 3)], dir);
    expect(m.rows).toBe(3);
    expect(readCachedCandles(KEY, dir).map((x) => x.openTime)).toEqual([10, 20, 30]);
  });
});
