// Walk-forward evaluation: split the window into N contiguous, non-overlapping folds and
// run the agent on each. For fixed-rule agents (no in-sample fitting) this is segmented
// out-of-sample evaluation, which shows robustness across market regimes rather than a
// single lucky window. Deterministic.

import type { BacktestRun, Metrics } from "./types.js";
import { runBacktest, type RunBacktestParams } from "./engine.js";

export interface WalkForwardFold {
  index: number;
  startTs: number;
  endTs: number;
  run: BacktestRun;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  /** Means across folds of the headline metrics, an aggregate robustness summary. */
  aggregate: Pick<Metrics, "totalReturn" | "sharpe" | "maxDrawdown" | "winRate">;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export async function walkForward(
  params: RunBacktestParams,
  foldCount: number,
): Promise<WalkForwardResult> {
  if (foldCount < 1) throw new Error(`foldCount must be >= 1, got ${foldCount}`);
  const total = params.endTs - params.startTs;
  const size = total / foldCount;

  const folds: WalkForwardFold[] = [];
  for (let i = 0; i < foldCount; i += 1) {
    const foldStart = params.startTs + Math.floor(i * size);
    // The last fold extends to endTs so rounding never drops the tail.
    const foldEnd =
      i === foldCount - 1 ? params.endTs : params.startTs + Math.floor((i + 1) * size);
    const run = await runBacktest({ ...params, startTs: foldStart, endTs: foldEnd });
    folds.push({ index: i, startTs: foldStart, endTs: foldEnd, run });
  }

  return {
    folds,
    aggregate: {
      totalReturn: mean(folds.map((f) => f.run.metrics.totalReturn)),
      sharpe: mean(folds.map((f) => f.run.metrics.sharpe)),
      maxDrawdown: mean(folds.map((f) => f.run.metrics.maxDrawdown)),
      winRate: mean(folds.map((f) => f.run.metrics.winRate)),
    },
  };
}
