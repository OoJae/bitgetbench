// Composite score: one transparent, published number for the default leaderboard ranking.
// Users can still sort by any raw metric. A run that is not leak-clean scores 0, so rigor
// is a gate, not a tunable. The formula and weights are documented in docs/methodology.md.

import type { Metrics, LeakCertificate, AgentKind, VerificationTier } from "./types.js";

/** Published weights. They sum to 1 across the three reward terms. */
export const SCORE_WEIGHTS = {
  sharpe: 0.5,
  drawdown: 0.3,
  totalReturn: 0.2,
} as const;

/** Sharpe is divided by this before clamping to [-1, 1], so Sharpe 3 saturates the term. */
export const SHARPE_SATURATION = 3;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Composite score in roughly [-1, 1]. Leak-dirty runs score 0 (disqualified). Higher is
 * better: rewards risk-adjusted return (Sharpe) and fee-adjusted return, penalizes drawdown.
 */
export function compositeScore(metrics: Metrics, leak: LeakCertificate): number {
  if (!leak.clean) return 0;
  const sharpeTerm = clamp(metrics.sharpe / SHARPE_SATURATION, -1, 1);
  const drawdownTerm = 1 - clamp(metrics.maxDrawdown, 0, 1); // 1 = no drawdown
  const returnTerm = clamp(metrics.totalReturn, -1, 1);
  return (
    SCORE_WEIGHTS.sharpe * sharpeTerm +
    SCORE_WEIGHTS.drawdown * drawdownTerm +
    SCORE_WEIGHTS.totalReturn * returnTerm
  );
}

/**
 * Honest provenance label for a run, orthogonal to the score. The score gate already
 * disqualifies leak-dirty fed data; the tier records how much of the agent we could verify:
 * an in-process agent on leak-clean data is `engine-verified`; a remote webhook on leak-clean
 * data we fed is `data-clean` (we cannot prove it did not fetch outside data); a run with a
 * look-ahead violation in the data we fed is `disqualified`.
 */
export function deriveVerificationTier(
  leak: LeakCertificate,
  agentKind: AgentKind,
): VerificationTier {
  if (!leak.clean) return "disqualified";
  if (agentKind === "remote-webhook" || leak.scope === "fed-data-only") return "data-clean";
  return "engine-verified";
}
