import { describe, expect, it } from "vitest";
import {
  LeakAuditor,
  wrapReaderWithAudit,
  regress,
  decomposeReturns,
  compositeScore,
  walkForward,
  runBenchmarked,
  type BenchAgent,
  type Candle,
  type MarketContext,
  type AgentDecision,
  type PointInTimeReader,
  type EngineConfig,
  type EquitySample,
  type Metrics,
  type LeakCertificate,
} from "../src/index.js";

const STEP = 1000;

function makeCandles(n: number, priceAt: (i: number) => number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const open = priceAt(i);
    const close = priceAt(i + 1);
    return {
      openTime: i * STEP,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: 1,
    };
  });
}

function makeReader(candles: Candle[]): PointInTimeReader {
  return {
    getCandlesUpTo(_s, _t, ts, opts) {
      const prefix = candles.filter((c) => c.openTime <= ts);
      const lb = opts?.lookback;
      return lb !== undefined ? prefix.slice(Math.max(0, prefix.length - lb)) : prefix;
    },
  };
}

class BuyAndHold implements BenchAgent {
  name = "buy-and-hold";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null)
      return { action: "long", symbol: ctx.symbol, sizePct: 1, leverage: 1, rationale: "enter" };
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "hold" };
  }
}

const config: EngineConfig = {
  startEquity: 10_000,
  fees: { takerFee: 0.0006 },
  slippage: { bps: 0 },
};
const candles = makeCandles(50, (i) => 100 + i); // steadily rising
const reader = makeReader(candles);
const base = { reader, symbol: "BTCUSDT", timeframe: "1s", startTs: 0, endTs: 49 * STEP };

describe("LeakAuditor", () => {
  it("is clean when context never exceeds the decision timestamp", () => {
    const a = new LeakAuditor();
    a.record([{ openTime: 5, open: 1, high: 1, low: 1, close: 1, volume: 0 }], 5, 6);
    const cert = a.certificate();
    expect(cert.clean).toBe(true);
    expect(cert.violations).toBe(0);
    expect(cert.maxLookaheadMs).toBe(0);
  });

  it("flags a future candle in context as a violation", () => {
    const a = new LeakAuditor();
    a.record([{ openTime: 10, open: 1, high: 1, low: 1, close: 1, volume: 0 }], 5, 6);
    const cert = a.certificate();
    expect(cert.clean).toBe(false);
    expect(cert.violations).toBe(1);
    expect(cert.maxLookaheadMs).toBe(5);
  });

  it("flags a fill at or before the decision timestamp", () => {
    const a = new LeakAuditor();
    a.record([{ openTime: 5, open: 1, high: 1, low: 1, close: 1, volume: 0 }], 5, 5);
    expect(a.certificate().violations).toBe(1);
  });

  it("wrapReaderWithAudit records context leaks for a cheating reader", () => {
    const cheating: PointInTimeReader = {
      getCandlesUpTo(_s, _t, ts) {
        // Returns a candle from the future (ts + STEP), i.e. a leak.
        return [{ openTime: ts + STEP, open: 1, high: 1, low: 1, close: 1, volume: 0 }];
      },
    };
    const auditor = new LeakAuditor();
    const wrapped = wrapReaderWithAudit(cheating, auditor);
    wrapped.getCandlesUpTo("BTCUSDT", "1s", 1000);
    expect(auditor.certificate().clean).toBe(false);
  });

  it("runBacktest produces a clean certificate for a normal agent", async () => {
    const { agentRun } = await runBenchmarked({ ...base, agent: new BuyAndHold(), config });
    const cert: LeakCertificate = agentRun.leakCertificate;
    expect(cert.clean).toBe(true);
    expect(cert.violations).toBe(0);
    expect(cert.checkedSteps).toBe(candles.length - 1);
  });
});

describe("regress and decomposition", () => {
  function curve(values: number[]): EquitySample[] {
    return values.map((equity, i) => ({ timestamp: i * STEP, equity }));
  }

  it("recovers beta 1, alpha 0 when the series are identical", () => {
    const c = curve([100, 110, 105, 120, 130]);
    const { alpha, beta } = regress(c, c);
    expect(beta).toBeCloseTo(1, 9);
    expect(alpha).toBeCloseTo(0, 9);
  });

  it("gives beta 0 for a flat agent against a moving benchmark", () => {
    const flat = curve([100, 100, 100, 100, 100]);
    const bench = curve([100, 110, 105, 120, 130]);
    expect(regress(flat, bench).beta).toBeCloseTo(0, 9);
  });

  it("splits market and skill return", () => {
    // A varying curve so the benchmark has return variance (else beta is undefined).
    const c = curve([100, 110, 105, 120]);
    const total = 120 / 100 - 1;
    const d = decomposeReturns(c, c, total, total);
    expect(d.beta).toBeCloseTo(1, 9);
    expect(d.marketReturn).toBeCloseTo(total, 9);
    expect(d.skillReturn).toBeCloseTo(0, 9);
  });
});

describe("compositeScore", () => {
  const goodLeak: LeakCertificate = {
    clean: true,
    maxLookaheadMs: 0,
    checkedSteps: 10,
    violations: 0,
  };
  const baseMetrics: Metrics = {
    totalReturn: 0,
    cagr: 0,
    sharpe: 0,
    sortino: 0,
    maxDrawdown: 0,
    calmar: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    volatility: 0,
    trades: 0,
    exposure: 0,
  };

  it("disqualifies a leak-dirty run with score 0", () => {
    const dirty: LeakCertificate = {
      clean: false,
      maxLookaheadMs: 5,
      checkedSteps: 10,
      violations: 1,
    };
    expect(compositeScore({ ...baseMetrics, sharpe: 3, totalReturn: 1 }, dirty)).toBe(0);
  });

  it("rewards Sharpe, low drawdown, and return", () => {
    // sharpe 3 -> term 1 (*0.5); maxDD 0 -> term 1 (*0.3); totalReturn 1 -> term 1 (*0.2)
    const score = compositeScore(
      { ...baseMetrics, sharpe: 3, maxDrawdown: 0, totalReturn: 1 },
      goodLeak,
    );
    expect(score).toBeCloseTo(1, 9);
  });

  it("a flat clean run scores only the drawdown term", () => {
    expect(compositeScore(baseMetrics, goodLeak)).toBeCloseTo(0.3, 9);
  });
});

describe("walkForward", () => {
  it("splits into non-overlapping folds that cover the window", async () => {
    const wf = await walkForward({ ...base, agent: new BuyAndHold(), config }, 4);
    expect(wf.folds.length).toBe(4);
    expect(wf.folds[0]!.startTs).toBe(0);
    expect(wf.folds[3]!.endTs).toBe(49 * STEP);
    for (let i = 1; i < wf.folds.length; i += 1) {
      expect(wf.folds[i]!.startTs).toBe(wf.folds[i - 1]!.endTs);
    }
    expect(Number.isFinite(wf.aggregate.totalReturn)).toBe(true);
  });
});

describe("runBenchmarked", () => {
  it("assembles a RunResult with benchmark, decomposition, score, and journal root", async () => {
    const { result } = await runBenchmarked({ ...base, agent: new BuyAndHold(), config });
    // Agent is buy-and-hold, so it mirrors the benchmark: beta ~ 1.
    expect(result.decomposition.beta).toBeCloseTo(1, 6);
    expect(result.benchmark.totalReturn).toBeCloseTo(result.metrics.totalReturn, 9);
    expect(result.leakCertificate.clean).toBe(true);
    expect(result.journalRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});
