// SMA-crossover: a deterministic, no-LLM reference agent. Goes long when the fast SMA
// crosses above the slow SMA and exits (or flips short, if configured) when it crosses
// below. Stateless per call: it recomputes both SMAs at the last two bars from the
// point-in-time candle history to detect the cross, so replays are reproducible.

import type { BenchAgent, MarketContext, AgentDecision, Candle } from "@bitgetbench/core";

export interface SmaCrossoverConfig {
  fast: number;
  slow: number;
  /** Fraction of equity to commit on entry, 0..1. Default 1. */
  sizePct?: number;
  /** Leverage on entry. Default 1. */
  leverage?: number;
  /** If true, a bearish cross flips to short instead of going flat. Default false. */
  allowShort?: boolean;
}

/** Simple moving average of `close` over `period` bars ending at `endIndex` (inclusive). */
function smaAt(candles: Candle[], period: number, endIndex: number): number {
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) sum += candles[i]!.close;
  return sum / period;
}

export class SmaCrossoverAgent implements BenchAgent {
  readonly name: string;
  private readonly fast: number;
  private readonly slow: number;
  private readonly sizePct: number;
  private readonly leverage: number;
  private readonly allowShort: boolean;

  constructor(config: SmaCrossoverConfig, name?: string) {
    if (config.fast >= config.slow) {
      throw new Error(`SMA fast (${config.fast}) must be less than slow (${config.slow})`);
    }
    this.fast = config.fast;
    this.slow = config.slow;
    this.sizePct = config.sizePct ?? 1;
    this.leverage = config.leverage ?? 1;
    this.allowShort = config.allowShort ?? false;
    this.name = name ?? `sma-${this.fast}-${this.slow}`;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    const c = ctx.candles;
    const n = c.length;
    const hold = (why: string): AgentDecision => ({
      action: "hold",
      symbol: ctx.symbol,
      sizePct: 0,
      rationale: why,
    });

    // Need the slow SMA at the last two bars to detect a cross.
    if (n < this.slow + 1) return hold(`Warming up: ${n}/${this.slow + 1} candles.`);

    const last = n - 1;
    const fastNow = smaAt(c, this.fast, last);
    const slowNow = smaAt(c, this.slow, last);
    const fastPrev = smaAt(c, this.fast, last - 1);
    const slowPrev = smaAt(c, this.slow, last - 1);

    const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
    const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;

    if (crossedUp) {
      return {
        action: "long",
        symbol: ctx.symbol,
        sizePct: this.sizePct,
        leverage: this.leverage,
        rationale: `Bullish cross: fast SMA(${this.fast})=${fastNow.toFixed(2)} crossed above slow SMA(${this.slow})=${slowNow.toFixed(2)}.`,
      };
    }
    if (crossedDown) {
      if (this.allowShort) {
        return {
          action: "short",
          symbol: ctx.symbol,
          sizePct: this.sizePct,
          leverage: this.leverage,
          rationale: `Bearish cross: fast SMA(${this.fast})=${fastNow.toFixed(2)} crossed below slow SMA(${this.slow})=${slowNow.toFixed(2)}.`,
        };
      }
      return {
        action: "close",
        symbol: ctx.symbol,
        sizePct: 0,
        rationale: `Bearish cross: fast SMA(${this.fast})=${fastNow.toFixed(2)} crossed below slow SMA(${this.slow})=${slowNow.toFixed(2)}, exit to flat.`,
      };
    }
    return hold(
      `No cross: fast SMA(${this.fast})=${fastNow.toFixed(2)}, slow SMA(${this.slow})=${slowNow.toFixed(2)}.`,
    );
  }
}
