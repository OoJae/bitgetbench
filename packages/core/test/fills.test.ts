import { describe, expect, it } from "vitest";
import { fillPrice, takerFeeUsd, simulateFill } from "../src/index.js";

describe("fillPrice", () => {
  it("moves the price up for a buy and down for a sell", () => {
    expect(fillPrice(100, "buy", { bps: 10 })).toBeCloseTo(100.1, 9);
    expect(fillPrice(100, "sell", { bps: 10 })).toBeCloseTo(99.9, 9);
  });

  it("is a no-op at zero slippage", () => {
    expect(fillPrice(100, "buy", { bps: 0 })).toBe(100);
    expect(fillPrice(100, "sell", { bps: 0 })).toBe(100);
  });
});

describe("takerFeeUsd", () => {
  it("is a fraction of notional", () => {
    expect(takerFeeUsd(10_000, { takerFee: 0.0006 })).toBeCloseTo(6, 9);
  });
});

describe("simulateFill", () => {
  it("bundles price, notional, fee, and slippage", () => {
    const fill = simulateFill("buy", 100, 10_000, { takerFee: 0.0006 }, { bps: 5 });
    expect(fill.price).toBeCloseTo(100.05, 9);
    expect(fill.sizeUsd).toBe(10_000);
    expect(fill.feeUsd).toBeCloseTo(6, 9);
    expect(fill.slippageBps).toBe(5);
  });
});
