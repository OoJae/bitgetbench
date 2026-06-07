// Property test for the point-in-time reader. This is the leak-safety guarantee that
// the whole harness rests on (hard rule 4): for any series and any query timestamp, the
// reader returns exactly the maximal ascending prefix with openTime <= ts, and never a
// future candle.

import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { Candle } from "@bitgetbench/core";
import { InMemoryPointInTimeReader, countUpTo } from "../src/index.js";

function candleAt(openTime: number): Candle {
  return { openTime, open: 1, high: 1, low: 1, close: 1, volume: 0 };
}

// Arbitrary strictly-ascending series plus a query timestamp that ranges from before the
// first bar to after the last bar (and lands exactly on bars in between).
const seriesAndTs = fc
  .uniqueArray(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 0, maxLength: 400 })
  .chain((times) => {
    const sorted = [...times].sort((a, b) => a - b);
    const lo = sorted.length > 0 ? sorted[0]! - 5 : -5;
    const hi = sorted.length > 0 ? sorted[sorted.length - 1]! + 5 : 5;
    return fc.record({
      candles: fc.constant(sorted.map(candleAt)),
      ts: fc.integer({ min: lo, max: hi }),
    });
  });

describe("InMemoryPointInTimeReader.getCandlesUpTo", () => {
  it("never returns a candle with openTime > ts, and returns the maximal prefix", () => {
    fc.assert(
      fc.property(seriesAndTs, ({ candles, ts }) => {
        const reader = new InMemoryPointInTimeReader();
        reader.add("BTCUSDT", "15m", candles);
        const out = reader.getCandlesUpTo("BTCUSDT", "15m", ts);

        // No look-ahead: every returned candle is at or before ts.
        for (const c of out) expect(c.openTime).toBeLessThanOrEqual(ts);

        // Exactly the candles at or before ts (reference impl via filter).
        const expected = candles.filter((c) => c.openTime <= ts);
        expect(out).toEqual(expected);

        // It is a true prefix of the series.
        expect(out).toEqual(candles.slice(0, out.length));

        // Boundary openTime === ts is included.
        if (candles.some((c) => c.openTime === ts)) {
          expect(out[out.length - 1]!.openTime).toBe(ts);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("lookback caps the result to the most recent N candles at or before ts", () => {
    fc.assert(
      fc.property(seriesAndTs, fc.integer({ min: 0, max: 50 }), ({ candles, ts }, lookback) => {
        const reader = new InMemoryPointInTimeReader();
        reader.add("BTCUSDT", "15m", candles);
        const full = reader.getCandlesUpTo("BTCUSDT", "15m", ts);
        const limited = reader.getCandlesUpTo("BTCUSDT", "15m", ts, { lookback });

        expect(limited.length).toBeLessThanOrEqual(lookback);
        // It is the tail of the full prefix.
        expect(limited).toEqual(full.slice(Math.max(0, full.length - lookback)));
        for (const c of limited) expect(c.openTime).toBeLessThanOrEqual(ts);
      }),
      { numRuns: 300 },
    );
  });

  it("countUpTo agrees with a linear filter", () => {
    fc.assert(
      fc.property(seriesAndTs, ({ candles, ts }) => {
        expect(countUpTo(candles, ts)).toBe(candles.filter((c) => c.openTime <= ts).length);
      }),
      { numRuns: 300 },
    );
  });
});

describe("InMemoryPointInTimeReader.setSeries", () => {
  it("rejects a non-ascending series so a mis-sorted cache fails loudly", () => {
    const reader = new InMemoryPointInTimeReader();
    expect(() => reader.add("BTCUSDT", "15m", [candleAt(10), candleAt(5)])).toThrow();
    expect(() => reader.add("BTCUSDT", "15m", [candleAt(10), candleAt(10)])).toThrow();
  });

  it("returns an empty array for an unknown series", () => {
    const reader = new InMemoryPointInTimeReader();
    expect(reader.getCandlesUpTo("NOPE", "15m", 123)).toEqual([]);
  });
});
