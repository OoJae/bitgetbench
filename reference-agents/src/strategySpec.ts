// A declarative strategy spec compiles to one of the deterministic reference agents. This is
// the leak-clean, fully reproducible "chat to backtest a strategy" path: an external agent (on
// MuleRun, GetAgent, Telegram, etc.) sends a small JSON spec, BitgetBench runs it in-process.
// No arbitrary code, no eval: the spec is a whitelisted kind plus bounded numeric params, so it
// has no remote-execution surface and always earns the engine-verified tier.

import type { BenchAgent } from "@bitgetbench/core";
import { sha256Hex, stableStringify } from "@bitgetbench/core";
import { SmaCrossoverAgent } from "./smaCrossover.js";
import { RsiReversionAgent } from "./rsiReversion.js";
import { BreakoutAgent } from "./breakout.js";
import { BuyAndHoldAgent } from "./buyAndHold.js";

export type StrategyKind = "sma_cross" | "rsi_reversion" | "breakout" | "buy_and_hold";

export const STRATEGY_KINDS: readonly StrategyKind[] = [
  "sma_cross",
  "rsi_reversion",
  "breakout",
  "buy_and_hold",
];

/** Hard caps on a spec, independent of the guardrail (which clamps further at run time). */
export const SPEC_LIMITS = {
  maxLeverage: 10,
  maxPeriod: 400,
} as const;

export interface StrategySpec {
  kind: StrategyKind;
  /** Kind-specific numeric params (e.g. { fast: 20, slow: 50 }). */
  params?: Record<string, number>;
  /** Fraction of equity per entry, 0..1. */
  sizePct?: number;
  /** Leverage on entry, 1..maxLeverage. */
  leverage?: number;
  /** sma_cross only: flip to short on a bearish cross instead of going flat. */
  allowShort?: boolean;
  /** Optional board label; defaults to a name derived from kind + params. */
  name?: string;
}

function fail(msg: string): never {
  throw new Error(`invalid strategy spec: ${msg}`);
}

function num(
  obj: Record<string, number>,
  key: string,
  min: number,
  max: number,
  opts: { int?: boolean; default?: number } = {},
): number {
  const raw = obj[key];
  const v = raw === undefined ? opts.default : raw;
  if (v === undefined) fail(`missing numeric param "${key}"`);
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`param "${key}" must be a finite number`);
  if (opts.int && !Number.isInteger(v)) fail(`param "${key}" must be an integer`);
  if (v < min || v > max) fail(`param "${key}" must be in [${min}, ${max}]`);
  return v;
}

/**
 * Validate and normalize a spec, filling defaults. Throws a clear Error on any bad shape or
 * out-of-range value. The returned spec is safe to compile and to hash for a stable run id.
 */
export function validateSpec(input: unknown): StrategySpec {
  if (!input || typeof input !== "object") fail("spec must be an object");
  const raw = input as Record<string, unknown>;
  const kind = raw.kind;
  if (typeof kind !== "string" || !STRATEGY_KINDS.includes(kind as StrategyKind)) {
    fail(`kind must be one of ${STRATEGY_KINDS.join(", ")}`);
  }
  const params = (raw.params ?? {}) as Record<string, number>;
  if (typeof params !== "object" || Array.isArray(params)) fail("params must be an object");

  const sizePct = num({ sizePct: raw.sizePct as number }, "sizePct", 0.000001, 1, { default: 1 });
  const leverage = num(
    { leverage: raw.leverage as number },
    "leverage",
    1,
    SPEC_LIMITS.maxLeverage,
    {
      default: 1,
    },
  );
  const allowShort = raw.allowShort === undefined ? false : Boolean(raw.allowShort);
  const name = raw.name === undefined ? undefined : String(raw.name).slice(0, 64);

  const out: StrategySpec = { kind: kind as StrategyKind, sizePct, leverage, allowShort };
  if (name) out.name = name;

  switch (kind) {
    case "sma_cross": {
      const fast = num(params, "fast", 1, SPEC_LIMITS.maxPeriod, { int: true });
      const slow = num(params, "slow", 1, SPEC_LIMITS.maxPeriod, { int: true });
      if (slow <= fast) fail('"slow" must be greater than "fast"');
      out.params = { fast, slow };
      break;
    }
    case "rsi_reversion": {
      const period = num(params, "period", 2, 100, { int: true, default: 14 });
      const oversold = num(params, "oversold", 1, 50, { default: 30 });
      const exitLevel = num(params, "exitLevel", oversold, 99, { default: 50 });
      out.params = { period, oversold, exitLevel };
      break;
    }
    case "breakout": {
      const lookback = num(params, "lookback", 2, SPEC_LIMITS.maxPeriod, {
        int: true,
        default: 20,
      });
      out.params = { lookback };
      break;
    }
    case "buy_and_hold":
      out.params = {};
      break;
  }
  return out;
}

/** Compile a validated spec into a deterministic in-process BenchAgent. */
export function specToAgent(spec: StrategySpec): BenchAgent {
  const v = validateSpec(spec);
  const p = v.params ?? {};
  // validateSpec guarantees these are present and in range.
  const sizePct = v.sizePct ?? 1;
  const leverage = v.leverage ?? 1;
  const allowShort = v.allowShort ?? false;
  switch (v.kind) {
    case "sma_cross":
      return new SmaCrossoverAgent(
        { fast: p.fast!, slow: p.slow!, sizePct, leverage, allowShort },
        v.name,
      );
    case "rsi_reversion":
      return new RsiReversionAgent(
        { period: p.period!, oversold: p.oversold!, exitLevel: p.exitLevel!, sizePct, leverage },
        v.name,
      );
    case "breakout":
      return new BreakoutAgent({ lookback: p.lookback!, sizePct, leverage }, v.name);
    case "buy_and_hold":
      return new BuyAndHoldAgent(v.name ?? "buy-and-hold");
  }
}

/** A stable content hash of a validated spec, used as a deterministic run id (`spec:<hash>`). */
export function specHash(spec: StrategySpec): string {
  return sha256Hex(stableStringify(validateSpec(spec))).slice(0, 32);
}
