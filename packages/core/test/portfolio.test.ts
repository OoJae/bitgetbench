import { describe, expect, it } from "vitest";
import { Portfolio } from "../src/index.js";

const FEES = { takerFee: 0.0006 };
const NO_SLIP = { bps: 0 };

describe("Portfolio long", () => {
  it("opens, marks to market, and closes realizing PnL net of fees", () => {
    const p = new Portfolio(10_000, FEES, NO_SLIP);
    p.openPosition("long", 100, 1, 1, 1);
    // notional 10000, qty 100, entry fee 6 -> cash 9994, equity flat at entry
    expect(p.cash).toBeCloseTo(9994, 9);
    expect(p.equity(100)).toBeCloseTo(9994, 9);
    // mark up 10%
    expect(p.unrealizedPnl(110)).toBeCloseTo(1000, 9);
    expect(p.equity(110)).toBeCloseTo(10_994, 9);

    const trade = p.closePosition(110, 2)!;
    const exitFee = 100 * 110 * 0.0006; // 6.6
    expect(trade.pnlUsd).toBeCloseTo(1000 - (6 + exitFee), 9);
    expect(trade.feeUsd).toBeCloseTo(6 + exitFee, 9);
    expect(trade.side).toBe("long");
    expect(p.cash).toBeCloseTo(9994 + 1000 - exitFee, 9);
    expect(p.hasPosition()).toBe(false);
  });
});

describe("Portfolio short", () => {
  it("profits when price falls, with correct PnL sign", () => {
    const p = new Portfolio(10_000, FEES, NO_SLIP);
    p.openPosition("short", 100, 1, 1, 1);
    expect(p.unrealizedPnl(90)).toBeCloseTo(1000, 9);
    const trade = p.closePosition(90, 2)!;
    const exitFee = 100 * 90 * 0.0006; // 5.4
    expect(trade.pnlUsd).toBeCloseTo(1000 - (6 + exitFee), 9);
    expect(p.cash).toBeCloseTo(9994 + 1000 - exitFee, 9);
  });
});

describe("Portfolio guards and flips", () => {
  it("throws if opening while a position is already open", () => {
    const p = new Portfolio(10_000, FEES, NO_SLIP);
    p.openPosition("long", 100, 1, 1, 1);
    expect(() => p.openPosition("short", 100, 1, 1, 1)).toThrow();
  });

  it("supports a close-then-open flip sequence", () => {
    const p = new Portfolio(10_000, FEES, NO_SLIP);
    p.openPosition("long", 100, 1, 1, 1);
    p.closePosition(100, 2); // close flat (tiny loss from 2 fees)
    p.openPosition("short", 100, 1, 1, 3);
    expect(p.position?.side).toBe("short");
    expect(p.trades.length).toBe(1);
  });

  it("settleOpenPosition records a synthetic trade without changing cash", () => {
    const p = new Portfolio(10_000, FEES, NO_SLIP);
    p.openPosition("long", 100, 1, 1, 1);
    const cashBefore = p.cash;
    p.settleOpenPosition(110, 5);
    expect(p.cash).toBe(cashBefore); // no cash change on synthetic settle
    expect(p.hasPosition()).toBe(false);
    expect(p.trades.length).toBe(1);
    // pnl = gross 1000 minus only the entry fee (no exit fee)
    expect(p.trades[0]!.pnlUsd).toBeCloseTo(1000 - 6, 9);
    expect(p.trades[0]!.feeUsd).toBeCloseTo(6, 9);
  });
});
