// Donchian breakout: a deterministic, leak-free reference agent. Goes long when the latest
// close breaks above the highest high of the prior N bars, and exits when it breaks below
// the prior N-bar low. Computed from point-in-time candles, so it is backtest-safe.

import type { BenchAgent, MarketContext, AgentDecision, Candle } from "@bitgetbench/core";

export interface BreakoutConfig {
  lookback?: number;
  sizePct?: number;
  leverage?: number;
}

/** Highest high and lowest low over the `lookback` bars BEFORE the last candle. */
function priorChannel(candles: Candle[], lookback: number): { high: number; low: number } | null {
  // Exclude the most recent bar so the breakout compares the current close to the prior range.
  const end = candles.length - 1;
  const start = end - lookback;
  if (start < 0) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i < end; i += 1) {
    if (candles[i]!.high > high) high = candles[i]!.high;
    if (candles[i]!.low < low) low = candles[i]!.low;
  }
  return { high, low };
}

export class BreakoutAgent implements BenchAgent {
  readonly name: string;
  private readonly lookback: number;
  private readonly sizePct: number;
  private readonly leverage: number;

  constructor(config: BreakoutConfig = {}, name?: string) {
    this.lookback = config.lookback ?? 20;
    this.sizePct = config.sizePct ?? 0.5;
    this.leverage = config.leverage ?? 1;
    this.name = name ?? `breakout-${this.lookback}`;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    const channel = priorChannel(ctx.candles, this.lookback);
    if (channel === null) {
      return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "Warming up channel." };
    }
    const close = ctx.candles[ctx.candles.length - 1]!.close;
    if (ctx.position === null) {
      if (close > channel.high) {
        return {
          action: "long",
          symbol: ctx.symbol,
          sizePct: this.sizePct,
          leverage: this.leverage,
          rationale: `Breakout: close ${close.toFixed(2)} > ${this.lookback}-bar high ${channel.high.toFixed(2)}.`,
        };
      }
      return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "No breakout." };
    }
    if (close < channel.low) {
      return {
        action: "close",
        symbol: ctx.symbol,
        sizePct: 0,
        rationale: `Breakdown: close ${close.toFixed(2)} < ${this.lookback}-bar low ${channel.low.toFixed(2)}, exit.`,
      };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "Holding breakout." };
  }
}
