import { describe, expect, it } from "vitest";
import {
  runBacktest,
  runBenchmarked,
  replayFromJournal,
  contextHashOf,
  deriveVerificationTier,
  verifyJournal,
  type BenchAgent,
  type Candle,
  type MarketContext,
  type AgentDecision,
  type PointInTimeReader,
  type EngineConfig,
  type LeakCertificate,
} from "../src/index.js";

const STEP = 1000;

function makeCandles(spec: Array<[number, number]>): Candle[] {
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

const baseConfig: EngineConfig = {
  startEquity: 10_000,
  fees: { takerFee: 0.0006 },
  slippage: { bps: 0 },
};

class BuyAndHold implements BenchAgent {
  name = "buy-and-hold";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null) {
      return { action: "long", symbol: ctx.symbol, sizePct: 1, leverage: 1, rationale: "enter" };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "hold" };
  }
}

const candles = makeCandles([
  [100, 100],
  [100, 110],
  [110, 120],
  [120, 130],
  [130, 140],
]);
const reader = makeReader(candles);
const common = { reader, symbol: "BTCUSDT", timeframe: "1s", startTs: 0, endTs: 4 * STEP };

const cleanCert: LeakCertificate = {
  clean: true,
  maxLookaheadMs: 0,
  checkedSteps: 4,
  violations: 0,
  scope: "engine",
};

describe("contextHashOf", () => {
  it("is deterministic and sensitive to context", () => {
    const ctx: MarketContext = {
      timestamp: 1000,
      symbol: "BTCUSDT",
      timeframe: "1s",
      candles: candles.slice(0, 2),
      position: null,
      equity: 10_000,
    };
    expect(contextHashOf(ctx)).toBe(contextHashOf({ ...ctx }));
    expect(contextHashOf(ctx)).not.toBe(contextHashOf({ ...ctx, equity: 9_999 }));
    expect(contextHashOf(ctx)).not.toBe(contextHashOf({ ...ctx, timestamp: 2000 }));
  });
});

describe("deriveVerificationTier", () => {
  it("maps (clean, scope, kind) to the honest tier", () => {
    expect(deriveVerificationTier(cleanCert, "local")).toBe("engine-verified");
    expect(deriveVerificationTier(cleanCert, "strategy-spec")).toBe("engine-verified");
    expect(deriveVerificationTier(cleanCert, "remote-webhook")).toBe("data-clean");
    expect(deriveVerificationTier({ ...cleanCert, scope: "fed-data-only" }, "local")).toBe(
      "data-clean",
    );
    expect(deriveVerificationTier({ ...cleanCert, clean: false }, "local")).toBe("disqualified");
    expect(deriveVerificationTier({ ...cleanCert, clean: false }, "remote-webhook")).toBe(
      "disqualified",
    );
  });
});

describe("agentKind drives leak scope and tier", () => {
  it("a remote-webhook run gets fed-data-only scope and the data-clean tier", async () => {
    const { result } = await runBenchmarked({
      ...common,
      agent: new BuyAndHold(),
      config: baseConfig,
      agentKind: "remote-webhook",
    });
    expect(result.leakCertificate.scope).toBe("fed-data-only");
    expect(result.agentKind).toBe("remote-webhook");
    expect(result.verificationTier).toBe("data-clean");
  });

  it("a local run stays engine scope and engine-verified", async () => {
    const { result } = await runBenchmarked({
      ...common,
      agent: new BuyAndHold(),
      config: baseConfig,
    });
    expect(result.leakCertificate.scope).toBe("engine");
    expect(result.agentKind).toBe("local");
    expect(result.verificationTier).toBe("engine-verified");
  });
});

describe("replayFromJournal", () => {
  it("reproduces the journalRoot from recorded decisions", async () => {
    const run = await runBacktest({ ...common, agent: new BuyAndHold(), config: baseConfig });
    expect(verifyJournal(run.journal).ok).toBe(true);
    const replay = await replayFromJournal(run.journal, { ...common, config: baseConfig });
    expect(replay.ok).toBe(true);
    expect(replay.actualRoot).toBe(replay.expectedRoot);
    expect(replay.actualRoot).toBe(run.journalRoot);
  });

  it("fails when a recorded decision is altered", async () => {
    const run = await runBacktest({ ...common, agent: new BuyAndHold(), config: baseConfig });
    const tampered = run.journal.map((e, i) =>
      i === 1 ? { ...e, decision: { ...e.decision, action: "short" as const } } : e,
    );
    const replay = await replayFromJournal(tampered, { ...common, config: baseConfig });
    expect(replay.ok).toBe(false);
  });
});
