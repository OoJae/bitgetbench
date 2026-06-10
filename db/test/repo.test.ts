import { describe, expect, it } from "vitest";
import type { RunResult, Metrics, EquitySample, Trade } from "@bitgetbench/core";
import {
  getDb,
  insertRun,
  recordEvent,
  getStats,
  topRuns,
  getRun,
  downsample,
} from "../src/index.js";

function metrics(over: Partial<Metrics> = {}): Metrics {
  return {
    totalReturn: 0.1,
    cagr: 0.2,
    sharpe: 1.5,
    sortino: 2,
    maxDrawdown: 0.1,
    calmar: 2,
    winRate: 0.6,
    profitFactor: 1.8,
    expectancy: 5,
    volatility: 0.3,
    trades: 4,
    exposure: 0.5,
    ...over,
  };
}

function runResult(agent: string, score: number): RunResult {
  return {
    agent,
    symbol: "BTCUSDT",
    timeframe: "15m",
    startTs: 1000,
    endTs: 2000,
    startEquity: 10_000,
    endEquity: 11_000,
    metrics: metrics(),
    benchmark: metrics({ totalReturn: 0.05 }),
    decomposition: { alpha: 0.001, beta: 0.9, marketReturn: 0.045, skillReturn: 0.055 },
    leakCertificate: { clean: true, maxLookaheadMs: 0, checkedSteps: 100, violations: 0 },
    journalRoot: "a".repeat(64),
    score,
  };
}

const equity: EquitySample[] = [
  { timestamp: 1000, equity: 10_000 },
  { timestamp: 2000, equity: 11_000 },
];
const trades: Trade[] = [
  {
    entryTs: 1000,
    exitTs: 1500,
    side: "long",
    entry: 100,
    exit: 110,
    qty: 1,
    pnlUsd: 10,
    feeUsd: 0.1,
    returnPct: 0.1,
  },
];

describe("insertRun / topRuns / getRun", () => {
  it("round-trips a run with its trades and parses JSON columns", () => {
    const db = getDb(":memory:");
    const id = insertRun(db, {
      result: runResult("alpha", 0.5),
      equityCurve: equity,
      trades,
      mode: "backtest",
      clientId: "c1",
    });
    const top = topRuns(db);
    expect(top.length).toBe(1);
    expect(top[0]!.agent).toBe("alpha");
    expect(top[0]!.leakClean).toBe(true);
    expect(top[0]!.equity.length).toBe(2);
    expect(top[0]!.benchmark.totalReturn).toBeCloseTo(0.05, 9);

    const detail = getRun(db, id);
    expect(detail?.trades.length).toBe(1);
    expect(detail?.trades[0]!.side).toBe("long");
  });

  it("orders by score descending", () => {
    const db = getDb(":memory:");
    insertRun(db, {
      result: runResult("low", 0.1),
      equityCurve: equity,
      trades: [],
      mode: "backtest",
      clientId: "c1",
    });
    insertRun(db, {
      result: runResult("high", 0.9),
      equityCurve: equity,
      trades: [],
      mode: "backtest",
      clientId: "c1",
    });
    expect(topRuns(db).map((r) => r.agent)).toEqual(["high", "low"]);
  });

  it("upserts sandbox runs under a stable id", () => {
    const db = getDb(":memory:");
    const a = insertRun(db, {
      result: runResult("s", 0.3),
      equityCurve: equity,
      trades: [],
      mode: "sandbox",
      clientId: "c1",
    });
    const b = insertRun(db, {
      result: runResult("s", 0.4),
      equityCurve: equity,
      trades: [],
      mode: "sandbox",
      clientId: "c1",
    });
    expect(a).toBe(b);
    expect(topRuns(db, 50, "sandbox").length).toBe(1);
  });
});

describe("getStats", () => {
  it("counts events and distinct users", () => {
    const db = getDb(":memory:");
    insertRun(db, {
      result: runResult("a", 0.5),
      equityCurve: equity,
      trades: [],
      mode: "backtest",
      clientId: "c1",
    });
    recordEvent(db, "backtest_run", "c1");
    recordEvent(db, "backtest_run", "c2");
    recordEvent(db, "api_call", "c2");
    const s = getStats(db);
    expect(s.agentsRegistered).toBe(1);
    expect(s.backtestsRun).toBe(2);
    expect(s.apiCalls).toBe(1);
    expect(s.distinctUsers).toBe(2);
    expect(s.leaderboardSize).toBe(1);
  });
});

describe("downsample", () => {
  it("caps the curve and keeps the first and last points", () => {
    const curve: EquitySample[] = Array.from({ length: 1000 }, (_, i) => ({
      timestamp: i,
      equity: 100 + i,
    }));
    const ds = downsample(curve, 10);
    expect(ds.length).toBe(10);
    expect(ds[0]).toEqual({ t: 0, e: 100 });
    expect(ds[ds.length - 1]).toEqual({ t: 999, e: 1099 });
  });
});
