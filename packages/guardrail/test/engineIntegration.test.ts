// Proves the guardrail actually screens decisions inside a real backtest: an aggressive
// agent (full size, 10x) is clamped to the policy caps, and the clamp is recorded in the
// journal verdicts.

import { describe, expect, it } from "vitest";
import {
  runBacktest,
  type BenchAgent,
  type Candle,
  type MarketContext,
  type AgentDecision,
  type PointInTimeReader,
  type EngineConfig,
} from "@bitgetbench/core";
import { PolicyGuardRail, type GuardRailPolicy } from "../src/index.js";

const STEP = 1000;
const candles: Candle[] = Array.from({ length: 10 }, (_, i) => {
  const price = 100 + i;
  return {
    openTime: i * STEP,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price + 1,
    volume: 1,
  };
});
const reader: PointInTimeReader = {
  getCandlesUpTo: (_s, _t, ts) => candles.filter((c) => c.openTime <= ts),
};

class Aggressive implements BenchAgent {
  name = "aggressive";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null) {
      return {
        action: "long",
        symbol: ctx.symbol,
        sizePct: 1,
        leverage: 10,
        rationale: "max risk",
      };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "hold" };
  }
}

const policy: GuardRailPolicy = {
  maxPositionPct: 0.5,
  maxLeverage: 3,
  maxNotionalPct: 1.5,
  dailyLossLimitPct: 0.2,
  breakerCooldownMs: 1000,
  halfOpenSizeFactor: 0.5,
  drawdownKillPct: 0.5,
};

const config: EngineConfig = {
  startEquity: 10_000,
  fees: { takerFee: 0.0006 },
  slippage: { bps: 0 },
};

describe("guardrail inside runBacktest", () => {
  it("clamps an aggressive decision and records the clamp in the journal", async () => {
    const guardrail = new PolicyGuardRail(policy, config.startEquity);
    const run = await runBacktest({
      reader,
      symbol: "BTCUSDT",
      timeframe: "1s",
      startTs: 0,
      endTs: 9 * STEP,
      config,
      agent: new Aggressive(),
      guardrail,
    });

    // The opening entry's verdict should clamp leverage to the cap and carry reasons.
    const opening = run.journal.find((e) => e.decision.action === "long");
    expect(opening).toBeDefined();
    expect(opening!.verdict.allowed.leverage).toBe(3);
    expect(opening!.verdict.reasons.length).toBeGreaterThan(0);
    // And the recorded fill reflects the clamped notional (0.5 * 10000 * 3 = 15000).
    expect(opening!.fill?.sizeUsd).toBeCloseTo(15_000, 6);
  });
});
