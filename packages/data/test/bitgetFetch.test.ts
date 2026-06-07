// Tests for the backward-paging fetcher against a synthetic in-memory Bitget endpoint.
// Verifies it assembles a complete, deduped, ascending series across many pages and
// respects the [startMs, endMs) bounds, with no network and no real timers.

import { describe, expect, it } from "vitest";
import { fetchCandleRange } from "../src/index.js";

const STEP = 15 * 60_000;

/** Build a full synthetic series of openTimes [0, count) * STEP. */
function fullSeries(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i * STEP);
}

/**
 * A fake Bitget history-candles endpoint. Returns up to `limit` rows with openTime <
 * endTime, i.e. the newest bars below the cursor, matching how backward paging works.
 */
function makeFakeFetch(allOpenTimes: number[]): typeof fetch {
  const sorted = [...allOpenTimes].sort((a, b) => a - b);
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const endTime = Number(url.searchParams.get("endTime"));
    const limit = Number(url.searchParams.get("limit"));
    const below = sorted.filter((t) => t < endTime);
    const page = below.slice(Math.max(0, below.length - limit));
    const data = page.map((t) => [String(t), "1", "2", "0.5", "1.5", "10", "15"]);
    return new Response(JSON.stringify({ code: "00000", msg: "success", data }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("fetchCandleRange", () => {
  const sleepImpl = async (): Promise<void> => {};

  it("assembles a complete ascending series across multiple backward pages", async () => {
    const all = fullSeries(1000);
    const fetchImpl = makeFakeFetch(all);
    const candles = await fetchCandleRange({
      symbol: "BTCUSDT",
      timeframe: "15m",
      startMs: 0,
      endMs: 1000 * STEP,
      config: { maxLimit: 200, pageDelayMs: 0 },
      fetchImpl,
      sleepImpl,
    });
    expect(candles.length).toBe(1000);
    expect(candles[0]!.openTime).toBe(0);
    expect(candles[candles.length - 1]!.openTime).toBe(999 * STEP);
    // Strictly ascending, no dupes.
    for (let i = 1; i < candles.length; i += 1) {
      expect(candles[i]!.openTime).toBeGreaterThan(candles[i - 1]!.openTime);
    }
  });

  it("filters to the requested [startMs, endMs) window", async () => {
    const all = fullSeries(500);
    const fetchImpl = makeFakeFetch(all);
    const startMs = 100 * STEP;
    const endMs = 200 * STEP;
    const candles = await fetchCandleRange({
      symbol: "BTCUSDT",
      timeframe: "15m",
      startMs,
      endMs,
      config: { maxLimit: 50, pageDelayMs: 0 },
      fetchImpl,
      sleepImpl,
    });
    expect(candles[0]!.openTime).toBe(startMs);
    expect(candles[candles.length - 1]!.openTime).toBe(endMs - STEP);
    expect(candles.every((c) => c.openTime >= startMs && c.openTime < endMs)).toBe(true);
  });

  it("parses OHLCV fields from raw rows", async () => {
    const fetchImpl = makeFakeFetch([0]);
    const candles = await fetchCandleRange({
      symbol: "BTCUSDT",
      timeframe: "15m",
      startMs: 0,
      endMs: STEP,
      config: { maxLimit: 200, pageDelayMs: 0 },
      fetchImpl,
      sleepImpl,
    });
    expect(candles).toEqual([{ openTime: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }]);
  });

  it("retries on a transient error then succeeds", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n += 1;
      if (n < 3) return new Response("boom", { status: 502 });
      return new Response(
        JSON.stringify({
          code: "00000",
          msg: "success",
          data: [["0", "1", "2", "0.5", "1.5", "10"]],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const candles = await fetchCandleRange({
      symbol: "BTCUSDT",
      timeframe: "15m",
      startMs: 0,
      endMs: STEP,
      config: { maxLimit: 200, pageDelayMs: 0, maxRetries: 5 },
      fetchImpl,
      sleepImpl,
    });
    expect(candles.length).toBe(1);
    expect(n).toBe(3);
  });
});
