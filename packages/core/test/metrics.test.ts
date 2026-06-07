import { describe, expect, it } from "vitest";
import { computeMetrics, maxDrawdown, type EquitySample, type Trade } from "../src/index.js";

const DAY = 24 * 60 * 60 * 1000;

function curve(values: number[]): EquitySample[] {
  return values.map((equity, i) => ({ timestamp: i * DAY, equity }));
}

function trade(pnlUsd: number): Trade {
  return {
    entryTs: 0,
    exitTs: DAY,
    side: "long",
    entry: 1,
    exit: 1,
    qty: 1,
    pnlUsd,
    feeUsd: 0,
    returnPct: 0,
  };
}

describe("maxDrawdown", () => {
  it("is zero for a monotonically rising curve", () => {
    expect(maxDrawdown(curve([100, 101, 102, 103]))).toBe(0);
  });

  it("captures the largest peak-to-trough drop", () => {
    expect(maxDrawdown(curve([100, 110, 105, 120]))).toBeCloseTo(5 / 110, 9);
  });
});

describe("computeMetrics edge cases", () => {
  it("a flat curve yields zero return and zero volatility, never NaN", () => {
    const m = computeMetrics(curve([100, 100, 100]), [], { stepMs: DAY, exposure: 0 });
    expect(m.totalReturn).toBe(0);
    expect(m.volatility).toBe(0);
    expect(m.sharpe).toBe(0);
    expect(m.sortino).toBe(0);
    expect(m.calmar).toBe(0);
    expect(Number.isNaN(m.sharpe)).toBe(false);
  });

  it("computes totalReturn and passes exposure through", () => {
    const m = computeMetrics(curve([100, 110, 105, 120]), [], { stepMs: DAY, exposure: 0.5 });
    expect(m.totalReturn).toBeCloseTo(0.2, 9);
    expect(m.maxDrawdown).toBeCloseTo(5 / 110, 9);
    expect(m.exposure).toBe(0.5);
    expect(Number.isFinite(m.sharpe)).toBe(true);
    expect(Number.isFinite(m.volatility)).toBe(true);
  });
});

describe("computeMetrics trade stats", () => {
  it("computes winRate, profitFactor, and expectancy", () => {
    const trades = [trade(100), trade(-50), trade(50)];
    const m = computeMetrics(curve([100, 100]), trades, { stepMs: DAY, exposure: 1 });
    expect(m.trades).toBe(3);
    expect(m.winRate).toBeCloseTo(2 / 3, 9);
    expect(m.profitFactor).toBeCloseTo(150 / 50, 9);
    expect(m.expectancy).toBeCloseTo(100 / 3, 9);
  });

  it("reports infinite profit factor when there are no losing trades", () => {
    const m = computeMetrics(curve([100, 100]), [trade(10), trade(20)], {
      stepMs: DAY,
      exposure: 1,
    });
    expect(m.profitFactor).toBe(Number.POSITIVE_INFINITY);
  });
});
