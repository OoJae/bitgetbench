// Skill-driven momentum agent: a deterministic strategy over Agent-Hub-style technical
// perception (MACD, momentum, RSI) computed point-in-time from ctx.candles via
// @bitgetbench/adapters. It proves the BitgetBench integration surface against the kind of
// features the Agent Hub technical-analysis skill produces, while staying leak-free and
// reproducible for backtests. In the live paper-sandbox an agent could additionally read
// bgc / analyst-skill perception (sentiment, macro), which is live-only and not replayable.

import type { BenchAgent, MarketContext, AgentDecision } from "@bitgetbench/core";
import { technicalFeatures } from "@bitgetbench/adapters";

export interface SkillMomentumConfig {
  /** Fraction of equity committed on entry, 0..1. Default 0.5. */
  sizePct?: number;
  /** Leverage on entry. Default 2. */
  leverage?: number;
  /** RSI level above which longs are not opened (overbought). Default 70. */
  rsiOverbought?: number;
}

export class SkillMomentumAgent implements BenchAgent {
  readonly name: string;
  private readonly sizePct: number;
  private readonly leverage: number;
  private readonly rsiOverbought: number;

  constructor(config: SkillMomentumConfig = {}, name = "skill-momentum") {
    this.sizePct = config.sizePct ?? 0.5;
    this.leverage = config.leverage ?? 2;
    this.rsiOverbought = config.rsiOverbought ?? 70;
    this.name = name;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    const f = technicalFeatures(ctx.candles);
    const hold = (why: string): AgentDecision => ({
      action: "hold",
      symbol: ctx.symbol,
      sizePct: 0,
      rationale: why,
    });

    // Wait until the slowest indicator (MACD) and momentum are available.
    if (f.macd === null || f.momentum10 === null || f.rsi14 === null) {
      return hold("Warming up technical features.");
    }

    const bullish = f.macd.histogram > 0 && f.momentum10 > 0 && f.rsi14 < this.rsiOverbought;
    const bearish = f.macd.histogram < 0 || f.momentum10 < 0;

    if (ctx.position === null) {
      if (bullish) {
        return {
          action: "long",
          symbol: ctx.symbol,
          sizePct: this.sizePct,
          leverage: this.leverage,
          rationale: `Momentum long: MACD hist ${f.macd.histogram.toFixed(2)} > 0, momentum ${(f.momentum10 * 100).toFixed(2)}% > 0, RSI ${f.rsi14.toFixed(1)} < ${this.rsiOverbought}.`,
          confidence: Math.min(1, Math.abs(f.momentum10) * 10),
        };
      }
      return hold(
        `No long signal: MACD hist ${f.macd.histogram.toFixed(2)}, momentum ${(f.momentum10 * 100).toFixed(2)}%.`,
      );
    }

    if (bearish) {
      return {
        action: "close",
        symbol: ctx.symbol,
        sizePct: 0,
        rationale: `Exit: MACD hist ${f.macd.histogram.toFixed(2)} or momentum ${(f.momentum10 * 100).toFixed(2)}% turned negative.`,
      };
    }
    return hold("Holding long: trend intact.");
  }
}
