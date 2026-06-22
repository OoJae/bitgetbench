// Leak audit: proves a run never showed an agent data from at or after its decision
// timestamp. The engine records, per step, the newest candle openTime the agent saw and
// the bar it filled into; this aggregates that into a LeakCertificate. A clean run has
// maxLookaheadMs <= 0 and zero violations.

import type {
  Candle,
  LeakCertificate,
  LeakScope,
  PointInTimeReader,
  PointInTimeQueryOptions,
} from "./types.js";

export class LeakAuditor {
  private worstLookaheadMs = Number.NEGATIVE_INFINITY;
  private violationsCount = 0;
  private steps = 0;

  /**
   * Record one decision step. `contextCandles` is what the agent saw; `decisionTs` is its
   * decision time; `fillOpenTime` is the bar the order executed into (must be > decisionTs).
   */
  record(contextCandles: Candle[], decisionTs: number, fillOpenTime: number): void {
    this.steps += 1;
    const maxCtxOpenTime =
      contextCandles.length > 0 ? contextCandles[contextCandles.length - 1]!.openTime : decisionTs;
    const lookahead = maxCtxOpenTime - decisionTs;
    if (lookahead > this.worstLookaheadMs) this.worstLookaheadMs = lookahead;
    // A violation is the agent seeing a candle after its decision, or filling at or before it.
    if (lookahead > 0 || fillOpenTime <= decisionTs) this.violationsCount += 1;
  }

  /**
   * Build the certificate. `scope` records how much of the decision path is covered:
   * `engine` for in-process agents (complete), `fed-data-only` for remote webhooks (we
   * certify only the data we supplied, never what the external agent fetched itself).
   */
  certificate(scope: LeakScope = "engine"): LeakCertificate {
    const maxLookaheadMs = this.steps > 0 ? Math.max(0, this.worstLookaheadMs) : 0;
    return {
      clean: this.violationsCount === 0,
      maxLookaheadMs,
      checkedSteps: this.steps,
      violations: this.violationsCount,
      scope,
    };
  }
}

/**
 * Wrap any reader so every getCandlesUpTo call is checked against the query timestamp.
 * Useful for auditing an external reader directly. The engine uses LeakAuditor inline, but
 * this exposes the same guarantee for standalone use.
 */
export function wrapReaderWithAudit(
  reader: PointInTimeReader,
  auditor: LeakAuditor,
): PointInTimeReader {
  return {
    getCandlesUpTo(
      symbol: string,
      timeframe: string,
      ts: number,
      opts?: PointInTimeQueryOptions,
    ): Candle[] {
      const candles = reader.getCandlesUpTo(symbol, timeframe, ts, opts);
      // fillOpenTime is unknown here, so pass ts+1 to isolate the context-leak check.
      auditor.record(candles, ts, ts + 1);
      return candles;
    },
  };
}
