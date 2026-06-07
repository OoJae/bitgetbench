// GuardRail runtime state and its deterministic transitions: equity peak (for the
// drawdown kill-switch), the UTC day boundary (for the daily-loss breaker), the
// three-state circuit breaker, and a terminal killed flag. Pure functions; no I/O.

import type { GuardRailPolicy } from "./policy.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BreakerState = "closed" | "open" | "half-open";

export interface GuardRailState {
  equityPeak: number;
  dayStartEquity: number;
  /** UTC day index, floor(ts / DAY_MS). -1 until the first step sets it. */
  dayKey: number;
  breaker: BreakerState;
  breakerOpenedTs: number | null;
  /** Terminal for the run once the drawdown kill-switch trips. */
  killed: boolean;
}

export function initState(startEquity: number): GuardRailState {
  return {
    equityPeak: startEquity,
    dayStartEquity: startEquity,
    dayKey: -1,
    breaker: "closed",
    breakerOpenedTs: null,
    killed: false,
  };
}

/**
 * Advance the state with the equity entering a step. Returns a new state (no mutation):
 * rolls the day boundary, updates the peak, trips the kill-switch on drawdown, and runs
 * the breaker closed -> open -> half-open transitions.
 */
export function updateState(
  prev: GuardRailState,
  equity: number,
  ts: number,
  policy: GuardRailPolicy,
): GuardRailState {
  const s: GuardRailState = { ...prev };
  const dayKey = Math.floor(ts / DAY_MS);

  // New UTC day: reset the daily baseline and, unless killed, re-arm the breaker.
  if (dayKey !== s.dayKey) {
    s.dayKey = dayKey;
    s.dayStartEquity = equity;
    if (!s.killed) {
      s.breaker = "closed";
      s.breakerOpenedTs = null;
    }
  }

  if (equity > s.equityPeak) s.equityPeak = equity;

  // Drawdown kill-switch (terminal).
  const drawdown = s.equityPeak > 0 ? (s.equityPeak - equity) / s.equityPeak : 0;
  if (drawdown >= policy.drawdownKillPct) s.killed = true;

  // Daily-loss circuit breaker.
  const dayPnlFrac = s.dayStartEquity > 0 ? (equity - s.dayStartEquity) / s.dayStartEquity : 0;
  if (s.breaker === "closed" && dayPnlFrac <= -policy.dailyLossLimitPct) {
    s.breaker = "open";
    s.breakerOpenedTs = ts;
  } else if (
    s.breaker === "open" &&
    s.breakerOpenedTs !== null &&
    ts - s.breakerOpenedTs >= policy.breakerCooldownMs
  ) {
    s.breaker = "half-open";
  }

  return s;
}
