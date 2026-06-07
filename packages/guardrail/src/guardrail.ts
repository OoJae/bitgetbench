// The risk middleware: applyGuardRail clamps or blocks a decision against a policy and the
// current state. Pure and synchronous. PolicyGuardRail wraps it with state and implements
// the core GuardRail interface so the engine can drive it each step.

import type { AgentDecision, GuardRailVerdict, GuardRail } from "@bitgetbench/core";
import type { GuardRailPolicy } from "./policy.js";
import { type GuardRailState, initState, updateState } from "./state.js";

function holdLike(decision: AgentDecision, rationale: string): AgentDecision {
  return { action: "hold", symbol: decision.symbol, sizePct: 0, rationale };
}

function isOpening(action: AgentDecision["action"]): action is "long" | "short" {
  return action === "long" || action === "short";
}

/**
 * Screen a decision. Closing and holding are always allowed (they reduce risk). Opening is
 * blocked by the kill-switch, the open breaker, and symbol deny/allow lists, and is clamped
 * to the position, leverage, and notional caps (with a reduced cap in the half-open state).
 */
export function applyGuardRail(
  decision: AgentDecision,
  state: GuardRailState,
  policy: GuardRailPolicy,
): GuardRailVerdict {
  const reasons: string[] = [];

  // Kill-switch is terminal: force an exit and block everything else.
  if (state.killed) {
    if (decision.action === "close" || decision.action === "hold") {
      return { allowed: decision, blocked: false, reasons: [] };
    }
    return {
      allowed: {
        action: "close",
        symbol: decision.symbol,
        sizePct: 0,
        rationale: decision.rationale,
      },
      blocked: true,
      reasons: [
        `kill-switch active (drawdown >= ${(policy.drawdownKillPct * 100).toFixed(1)}%): forcing close`,
      ],
    };
  }

  if (!isOpening(decision.action)) {
    return { allowed: decision, blocked: false, reasons: [] };
  }

  // Symbol allow/deny.
  if (policy.symbolDeny?.includes(decision.symbol)) {
    return {
      allowed: holdLike(decision, decision.rationale),
      blocked: true,
      reasons: [`symbol ${decision.symbol} denied by policy`],
    };
  }
  if (policy.symbolAllow && !policy.symbolAllow.includes(decision.symbol)) {
    return {
      allowed: holdLike(decision, decision.rationale),
      blocked: true,
      reasons: [`symbol ${decision.symbol} not in allow-list`],
    };
  }

  // Open breaker blocks all new risk.
  if (state.breaker === "open") {
    return {
      allowed: holdLike(decision, decision.rationale),
      blocked: true,
      reasons: ["daily-loss breaker open: blocking new risk"],
    };
  }

  // Clamp size and leverage.
  let sizePct = decision.sizePct;
  let leverage = decision.leverage ?? 1;
  let sizeCap = policy.maxPositionPct;
  if (state.breaker === "half-open") {
    sizeCap *= policy.halfOpenSizeFactor;
    reasons.push(`breaker half-open: size capped to ${(sizeCap * 100).toFixed(1)}% of equity`);
  }
  if (sizePct > sizeCap) {
    reasons.push(
      `sizePct clamped ${(decision.sizePct * 100).toFixed(1)}% -> ${(sizeCap * 100).toFixed(1)}%`,
    );
    sizePct = sizeCap;
  }
  if (leverage > policy.maxLeverage) {
    reasons.push(`leverage clamped ${leverage} -> ${policy.maxLeverage}`);
    leverage = policy.maxLeverage;
  }
  if (policy.maxNotionalPct !== undefined && sizePct * leverage > policy.maxNotionalPct) {
    const newSize = policy.maxNotionalPct / leverage;
    reasons.push(
      `notional capped: sizePct ${(sizePct * 100).toFixed(1)}% -> ${(newSize * 100).toFixed(1)}% at ${leverage}x`,
    );
    sizePct = newSize;
  }

  const allowed: AgentDecision = { ...decision, sizePct, leverage };
  return { allowed, blocked: false, reasons };
}

/** Stateful guardrail the engine drives: onStep advances state, apply screens the decision. */
export class PolicyGuardRail implements GuardRail {
  private state: GuardRailState;
  private readonly policy: GuardRailPolicy;
  /** Verdicts are mirrored here for inspection/telemetry. */
  readonly verdicts: GuardRailVerdict[] = [];

  constructor(policy: GuardRailPolicy, startEquity: number) {
    this.policy = policy;
    this.state = initState(startEquity);
  }

  get breaker(): GuardRailState["breaker"] {
    return this.state.breaker;
  }

  get killed(): boolean {
    return this.state.killed;
  }

  onStep(equity: number, ts: number): void {
    this.state = updateState(this.state, equity, ts, this.policy);
  }

  apply(decision: AgentDecision): GuardRailVerdict {
    const verdict = applyGuardRail(decision, this.state, this.policy);
    this.verdicts.push(verdict);
    return verdict;
  }
}
