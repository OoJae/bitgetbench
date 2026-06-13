// RSI mean-reversion: a deterministic, leak-free reference agent. Goes long when RSI(14) is
// oversold and exits when it reverts past a midline. Uses the point-in-time RSI from
// @bitgetbench/adapters, so it is safe in backtests and reproducible.

import type { BenchAgent, MarketContext, AgentDecision } from "@bitgetbench/core";
import { rsi } from "@bitgetbench/adapters";

export interface RsiReversionConfig {
  period?: number;
  oversold?: number;
  exitLevel?: number;
  sizePct?: number;
  leverage?: number;
}

export class RsiReversionAgent implements BenchAgent {
  readonly name: string;
  private readonly period: number;
  private readonly oversold: number;
  private readonly exitLevel: number;
  private readonly sizePct: number;
  private readonly leverage: number;

  constructor(config: RsiReversionConfig = {}, name?: string) {
    this.period = config.period ?? 14;
    this.oversold = config.oversold ?? 30;
    this.exitLevel = config.exitLevel ?? 50;
    this.sizePct = config.sizePct ?? 0.5;
    this.leverage = config.leverage ?? 1;
    this.name = name ?? `rsi-reversion-${this.period}`;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    const r = rsi(ctx.candles, this.period);
    if (r === null) {
      return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "Warming up RSI." };
    }
    if (ctx.position === null) {
      if (r < this.oversold) {
        return {
          action: "long",
          symbol: ctx.symbol,
          sizePct: this.sizePct,
          leverage: this.leverage,
          rationale: `Oversold: RSI(${this.period})=${r.toFixed(1)} < ${this.oversold}.`,
        };
      }
      return {
        action: "hold",
        symbol: ctx.symbol,
        sizePct: 0,
        rationale: `RSI ${r.toFixed(1)}, waiting for oversold.`,
      };
    }
    if (r > this.exitLevel) {
      return {
        action: "close",
        symbol: ctx.symbol,
        sizePct: 0,
        rationale: `Reverted: RSI(${this.period})=${r.toFixed(1)} > ${this.exitLevel}, exit.`,
      };
    }
    return {
      action: "hold",
      symbol: ctx.symbol,
      sizePct: 0,
      rationale: `Holding: RSI ${r.toFixed(1)}.`,
    };
  }
}
