import { describe, expect, it } from "vitest";
import {
  runBacktest,
  type BenchAgent,
  type Candle,
  type MarketContext,
  type AgentDecision,
  type PointInTimeReader,
  type EngineConfig,
} from "../src/index.js";

const STEP = 1000;

function makeCandles(spec: Array<[open: number, close: number]>): Candle[] {
  return spec.map(([open, close], i) => ({
    openTime: i * STEP,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 1,
  }));
}

function makeReader(candles: Candle[]): PointInTimeReader {
  return {
    getCandlesUpTo(_symbol, _timeframe, ts, opts) {
      const prefix = candles.filter((c) => c.openTime <= ts);
      const lookback = opts?.lookback;
      return lookback !== undefined ? prefix.slice(Math.max(0, prefix.length - lookback)) : prefix;
    },
  };
}

const FEE = 0.0006;
const baseConfig: EngineConfig = {
  startEquity: 10_000,
  fees: { takerFee: FEE },
  slippage: { bps: 0 },
};

class AlwaysHold implements BenchAgent {
  name = "always-hold";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "hold" };
  }
}

class BuyAndHold implements BenchAgent {
  name = "buy-and-hold";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null) {
      return { action: "long", symbol: ctx.symbol, sizePct: 1, leverage: 1, rationale: "enter" };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "hold" };
  }
}

const common = {
  reader: makeReader(makeCandles([])),
  symbol: "BTCUSDT",
  timeframe: "1s",
  startTs: 0,
  endTs: 4 * STEP,
};

describe("runBacktest", () => {
  const candles = makeCandles([
    [100, 100],
    [100, 110],
    [110, 120],
    [120, 130],
    [130, 140],
  ]);
  const reader = makeReader(candles);

  it("always-hold ends flat with no trades", async () => {
    const run = await runBacktest({
      ...common,
      reader,
      agent: new AlwaysHold(),
      config: baseConfig,
    });
    expect(run.endEquity).toBe(10_000);
    expect(run.metrics.trades).toBe(0);
    expect(run.metrics.totalReturn).toBe(0);
    expect(run.equityCurve.every((s) => s.equity === 10_000)).toBe(true);
  });

  it("buy-and-hold reconciles to asset return minus the taker fee", async () => {
    const run = await runBacktest({
      ...common,
      reader,
      agent: new BuyAndHold(),
      config: baseConfig,
    });
    const entry = candles[1]!.open; // first fill open
    const finalClose = candles[candles.length - 1]!.close;
    const expected = finalClose / entry - 1 - FEE;
    expect(run.metrics.totalReturn).toBeCloseTo(expected, 12);
    expect(run.endEquity / 10_000).toBeCloseTo(finalClose / entry - FEE, 12);
  });

  it("is deterministic: two runs give identical equity curves", async () => {
    const a = await runBacktest({ ...common, reader, agent: new BuyAndHold(), config: baseConfig });
    const b = await runBacktest({ ...common, reader, agent: new BuyAndHold(), config: baseConfig });
    expect(a.equityCurve).toEqual(b.equityCurve);
    expect(a.endEquity).toBe(b.endEquity);
  });

  it("never shows the agent a candle at or beyond the bar it trades into (leak-safe)", async () => {
    const seen: Array<{ ts: number; maxOpenTime: number }> = [];
    const probe: BenchAgent = {
      name: "probe",
      async decide(ctx) {
        const maxOpenTime = ctx.candles[ctx.candles.length - 1]?.openTime ?? -1;
        seen.push({ ts: ctx.timestamp, maxOpenTime });
        return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "probe" };
      },
    };
    await runBacktest({ ...common, reader, agent: probe, config: baseConfig });
    // One decision per bar except the last (which has no next bar to fill into).
    expect(seen.length).toBe(candles.length - 1);
    for (const s of seen) {
      // The agent only ever sees candles at or before its decision timestamp.
      expect(s.maxOpenTime).toBeLessThanOrEqual(s.ts);
      // And the decision bar itself is included.
      expect(s.maxOpenTime).toBe(s.ts);
    }
  });

  it("throws if the window has fewer than two candles", async () => {
    const tiny = makeReader(makeCandles([[100, 100]]));
    await expect(
      runBacktest({ ...common, reader: tiny, agent: new BuyAndHold(), config: baseConfig }),
    ).rejects.toThrow();
  });
});
