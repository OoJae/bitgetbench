import { describe, expect, it } from "vitest";
import type { AgentDecision } from "@bitgetbench/core";
import {
  applyGuardRail,
  PolicyGuardRail,
  initState,
  updateState,
  validatePolicy,
  DEFAULT_POLICY,
  type GuardRailPolicy,
} from "../src/index.js";

const POLICY: GuardRailPolicy = {
  maxPositionPct: 0.5,
  maxLeverage: 3,
  maxNotionalPct: 1.5,
  dailyLossLimitPct: 0.1,
  breakerCooldownMs: 1000,
  halfOpenSizeFactor: 0.5,
  drawdownKillPct: 0.3,
};

const DAY = 24 * 60 * 60 * 1000;

function long(): AgentDecision {
  return { action: "long", symbol: "BTCUSDT", sizePct: 1, leverage: 10, rationale: "go" };
}

/** A clean closed state at day 0. */
function closedState(equity = 10_000) {
  return updateState(initState(equity), equity, 0, POLICY);
}

describe("applyGuardRail clamping", () => {
  it("clamps sizePct and leverage to the caps", () => {
    const v = applyGuardRail(long(), closedState(), POLICY);
    expect(v.blocked).toBe(false);
    expect(v.allowed.sizePct).toBeCloseTo(0.5, 9);
    expect(v.allowed.leverage).toBe(3);
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it("caps notional fraction (sizePct * leverage)", () => {
    const tight: GuardRailPolicy = { ...POLICY, maxNotionalPct: 1.0 };
    const v = applyGuardRail(long(), closedState(), tight);
    // leverage clamps to 3, then sizePct reduces so 3 * sizePct <= 1 -> sizePct = 1/3.
    expect(v.allowed.leverage).toBe(3);
    expect(v.allowed.sizePct).toBeCloseTo(1 / 3, 9);
  });

  it("leaves close and hold untouched", () => {
    const close: AgentDecision = { action: "close", symbol: "BTCUSDT", sizePct: 0, rationale: "x" };
    const v = applyGuardRail(close, closedState(), POLICY);
    expect(v.blocked).toBe(false);
    expect(v.allowed).toEqual(close);
  });
});

describe("symbol allow/deny", () => {
  it("blocks a denied symbol", () => {
    const p: GuardRailPolicy = { ...POLICY, symbolDeny: ["BTCUSDT"] };
    const v = applyGuardRail(long(), closedState(), p);
    expect(v.blocked).toBe(true);
    expect(v.allowed.action).toBe("hold");
  });

  it("blocks a symbol not in the allow-list", () => {
    const p: GuardRailPolicy = { ...POLICY, symbolAllow: ["ETHUSDT"] };
    const v = applyGuardRail(long(), closedState(), p);
    expect(v.blocked).toBe(true);
    expect(v.allowed.action).toBe("hold");
  });
});

describe("daily-loss circuit breaker", () => {
  it("opens on a daily loss, blocks new risk, then half-opens after cooldown with reduced size", () => {
    let s = closedState(10_000);
    // Drop 11% on the same day -> breaker opens.
    s = updateState(s, 8_900, 100, POLICY);
    expect(s.breaker).toBe("open");
    expect(applyGuardRail(long(), s, POLICY).blocked).toBe(true);

    // After cooldown, same day -> half-open, size capped to 0.5 * maxPositionPct = 0.25.
    s = updateState(s, 8_900, 100 + POLICY.breakerCooldownMs, POLICY);
    expect(s.breaker).toBe("half-open");
    const v = applyGuardRail(long(), s, POLICY);
    expect(v.blocked).toBe(false);
    expect(v.allowed.sizePct).toBeCloseTo(0.25, 9);

    // New day re-arms the breaker to closed.
    s = updateState(s, 8_900, DAY, POLICY);
    expect(s.breaker).toBe("closed");
  });
});

describe("drawdown kill-switch", () => {
  it("trips on drawdown and forces a close, terminally", () => {
    let s = closedState(10_000);
    s = updateState(s, 6_900, 200, POLICY); // 31% drawdown >= 30%
    expect(s.killed).toBe(true);
    const v = applyGuardRail(long(), s, POLICY);
    expect(v.blocked).toBe(true);
    expect(v.allowed.action).toBe("close");

    // Stays killed even if equity recovers.
    s = updateState(s, 10_000, DAY, POLICY);
    expect(s.killed).toBe(true);
  });
});

describe("PolicyGuardRail", () => {
  it("drives state via onStep and records verdicts", () => {
    const g = new PolicyGuardRail(POLICY, 10_000);
    g.onStep(10_000, 0);
    const v1 = g.apply(long());
    expect(v1.allowed.leverage).toBe(3);
    g.onStep(8_900, 100);
    expect(g.breaker).toBe("open");
    expect(g.apply(long()).blocked).toBe(true);
    expect(g.verdicts.length).toBe(2);
  });
});

describe("validatePolicy", () => {
  it("accepts the default policy and rejects bad values", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toBe(DEFAULT_POLICY);
    expect(() => validatePolicy({ ...POLICY, maxPositionPct: 2 })).toThrow();
    expect(() => validatePolicy({ ...POLICY, maxLeverage: -1 })).toThrow();
  });
});
