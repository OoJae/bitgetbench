import { describe, expect, it } from "vitest";
import type { Candle } from "@bitgetbench/core";
import { sma, ema, rsi, macd, atr, momentum, technicalFeatures } from "../src/index.js";

function candles(closesIn: number[]): Candle[] {
  return closesIn.map((c, i) => ({
    openTime: i * 1000,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 1,
  }));
}

describe("sma", () => {
  it("averages the last N closes", () => {
    expect(sma(candles([1, 2, 3, 4, 5]), 3)).toBeCloseTo(4, 9); // (3+4+5)/3
  });
  it("returns null when there is not enough data", () => {
    expect(sma(candles([1, 2]), 3)).toBeNull();
  });
});

describe("ema", () => {
  it("equals SMA when all values are equal", () => {
    expect(ema(candles([5, 5, 5, 5, 5]), 3)).toBeCloseTo(5, 9);
  });
  it("weights recent values more (rising series)", () => {
    const e = ema(candles([1, 2, 3, 4, 5]), 3)!;
    expect(e).toBeGreaterThan(sma(candles([1, 2, 3, 4, 5]), 3)! - 1);
    expect(e).toBeLessThanOrEqual(5);
  });
});

describe("rsi", () => {
  it("is 100 when every change is a gain", () => {
    expect(rsi(candles([1, 2, 3, 4, 5, 6]), 5)).toBeCloseTo(100, 9);
  });
  it("sits near 50 for an alternating flat series", () => {
    const r = rsi(candles([10, 11, 10, 11, 10, 11, 10]), 6)!;
    expect(r).toBeGreaterThan(30);
    expect(r).toBeLessThan(70);
  });
  it("returns null without enough data", () => {
    expect(rsi(candles([1, 2]), 14)).toBeNull();
  });
});

describe("macd", () => {
  it("returns null until there are slow + signal bars", () => {
    expect(macd(candles(Array.from({ length: 20 }, (_, i) => i)))).toBeNull();
  });
  it("is positive for a steadily rising series", () => {
    const m = macd(candles(Array.from({ length: 60 }, (_, i) => 100 + i)));
    expect(m).not.toBeNull();
    expect(m!.macd).toBeGreaterThan(0);
  });
});

describe("atr and momentum", () => {
  it("atr averages the true range", () => {
    // Each candle has high-low = 2, so ATR ~ 2.
    expect(atr(candles([10, 10, 10, 10, 10]), 3)).toBeCloseTo(2, 9);
  });
  it("momentum is the N-bar return", () => {
    expect(momentum(candles([100, 101, 102, 110]), 3)).toBeCloseTo(110 / 100 - 1, 9);
  });
});

describe("technicalFeatures snapshot", () => {
  it("fills available indicators and nulls the unavailable", () => {
    const f = technicalFeatures(candles(Array.from({ length: 60 }, (_, i) => 100 + i)));
    expect(f.close).toBe(159);
    expect(f.sma20).not.toBeNull();
    expect(f.macd).not.toBeNull();
    expect(f.rsi14).not.toBeNull();
  });
});
