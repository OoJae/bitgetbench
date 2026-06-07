// Return decomposition: separate market-driven return from skill-driven return by
// regressing the agent's per-step returns on the benchmark's (buy-and-hold) per-step
// returns. beta is market exposure, alpha is the per-step intercept (skill). This is the
// LiveTradeBench-style separation of drift from skill. Deterministic OLS, no libraries.

import type { EquitySample, ReturnDecomposition } from "./types.js";
import { stepReturns } from "./metrics.js";

/**
 * OLS slope/intercept of y on x. Returns beta=0, alpha=mean(y) when x has no variance.
 * Pairs are truncated to the shorter series so misaligned lengths are safe.
 */
export function regress(
  agentCurve: EquitySample[],
  benchmarkCurve: EquitySample[],
): { alpha: number; beta: number } {
  const y = stepReturns(agentCurve);
  const x = stepReturns(benchmarkCurve);
  const n = Math.min(x.length, y.length);
  if (n === 0) return { alpha: 0, beta: 0 };

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const mx = sx / n;
  const my = sy / n;

  let cov = 0;
  let varx = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx;
    cov += dx * (y[i]! - my);
    varx += dx * dx;
  }
  if (varx === 0) return { alpha: my, beta: 0 };
  const beta = cov / varx;
  const alpha = my - beta * mx;
  return { alpha, beta };
}

/**
 * Full decomposition. marketReturn is the part of total return explained by beta exposure
 * to the benchmark; skillReturn is the residual.
 */
export function decomposeReturns(
  agentCurve: EquitySample[],
  benchmarkCurve: EquitySample[],
  agentTotalReturn: number,
  benchmarkTotalReturn: number,
): ReturnDecomposition {
  const { alpha, beta } = regress(agentCurve, benchmarkCurve);
  const marketReturn = beta * benchmarkTotalReturn;
  const skillReturn = agentTotalReturn - marketReturn;
  return { alpha, beta, marketReturn, skillReturn };
}
