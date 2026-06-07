// Declarative risk policy. Plain data so users tune limits in JSON without code. The
// guardrail clamps or blocks decisions against these caps and runs the circuit breaker
// and kill-switch off the same config.

export interface GuardRailPolicy {
  /** Cap on sizePct (fraction of equity committed as margin), 0..1. */
  maxPositionPct: number;
  /** Cap on leverage. */
  maxLeverage: number;
  /** Optional cap on notional fraction (sizePct * leverage). */
  maxNotionalPct?: number;
  /** Daily-loss circuit breaker: trips when day PnL <= -this fraction of day-start equity. */
  dailyLossLimitPct: number;
  /** After the breaker opens, it moves to half-open this many ms later. */
  breakerCooldownMs: number;
  /** In half-open, new-risk size is capped to this fraction of maxPositionPct. */
  halfOpenSizeFactor: number;
  /** Drawdown kill-switch: trips (forces close, halts new risk) at this drawdown from peak. */
  drawdownKillPct: number;
  /** Optional symbol allow-list. If set, only these symbols may open risk. */
  symbolAllow?: string[];
  /** Optional symbol deny-list. */
  symbolDeny?: string[];
}

/** A conservative default policy. Documented in docs/methodology.md (guardrail section). */
export const DEFAULT_POLICY: GuardRailPolicy = {
  maxPositionPct: 0.5,
  maxLeverage: 3,
  maxNotionalPct: 1.5,
  dailyLossLimitPct: 0.1,
  breakerCooldownMs: 4 * 60 * 60 * 1000,
  halfOpenSizeFactor: 0.5,
  drawdownKillPct: 0.3,
};

/** Validate a policy object, throwing on anything nonsensical. Returns the policy. */
export function validatePolicy(p: GuardRailPolicy): GuardRailPolicy {
  const pos = (name: string, v: number): void => {
    if (!Number.isFinite(v) || v < 0)
      throw new Error(`policy.${name} must be a non-negative number`);
  };
  pos("maxPositionPct", p.maxPositionPct);
  pos("maxLeverage", p.maxLeverage);
  pos("dailyLossLimitPct", p.dailyLossLimitPct);
  pos("breakerCooldownMs", p.breakerCooldownMs);
  pos("halfOpenSizeFactor", p.halfOpenSizeFactor);
  pos("drawdownKillPct", p.drawdownKillPct);
  if (p.maxNotionalPct !== undefined) pos("maxNotionalPct", p.maxNotionalPct);
  if (p.maxPositionPct > 1) throw new Error("policy.maxPositionPct must be <= 1");
  if (p.halfOpenSizeFactor > 1) throw new Error("policy.halfOpenSizeFactor must be <= 1");
  return p;
}
