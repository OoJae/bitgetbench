import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncRecentCandles, readCachedCandles, type CacheKey } from "../src/index.js";

const STEP = 15 * 60_000;
const KEY: CacheKey = { market: "usdt-futures", symbol: "BTCUSDT", timeframe: "15m" };

/** Fake Bitget endpoint over an aligned grid up to maxOpenTime. */
function makeFakeFetch(maxOpenTime: number): typeof fetch {
  const all: number[] = [];
  for (let t = 0; t <= maxOpenTime; t += STEP) all.push(t);
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const endTime = Number(url.searchParams.get("endTime"));
    const limit = Number(url.searchParams.get("limit"));
    const below = all.filter((t) => t < endTime);
    const page = below.slice(Math.max(0, below.length - limit));
    const data = page.map((t) => [String(t), "100", "101", "99", "100.5", "10", "15"]);
    return new Response(JSON.stringify({ code: "00000", msg: "success", data }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("syncRecentCandles", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bgb-poll-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("bootstraps recent closed candles when the cache is empty", async () => {
    const now = 100 * STEP;
    const res = await syncRecentCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      cacheDir: dir,
      now,
      bootstrapBars: 5,
      config: { pageDelayMs: 0 },
      fetchImpl: makeFakeFetch(now),
    });
    // Closed bars open at 94..99 step (the bar opening at 99*STEP closes at 100*STEP = now).
    expect(res.appended).toBe(6);
    expect(res.latest?.openTime).toBe(99 * STEP);
    expect(readCachedCandles(KEY, dir).length).toBe(6);
  });

  it("is idempotent when already up to date", async () => {
    const now = 100 * STEP;
    const opts = {
      symbol: "BTCUSDT",
      timeframe: "15m",
      cacheDir: dir,
      now,
      bootstrapBars: 5,
      config: { pageDelayMs: 0 },
      fetchImpl: makeFakeFetch(now),
    };
    await syncRecentCandles(opts);
    const second = await syncRecentCandles(opts);
    expect(second.appended).toBe(0);
  });

  it("appends only the new bar as time advances", async () => {
    const base = 100 * STEP;
    await syncRecentCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      cacheDir: dir,
      now: base,
      bootstrapBars: 5,
      config: { pageDelayMs: 0 },
      fetchImpl: makeFakeFetch(base),
    });
    // One step later, one new bar closes.
    const res = await syncRecentCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      cacheDir: dir,
      now: base + STEP,
      config: { pageDelayMs: 0 },
      fetchImpl: makeFakeFetch(base + STEP),
    });
    expect(res.appended).toBe(1);
    expect(res.latest?.openTime).toBe(100 * STEP);
  });
});
