// @bitgetbench/guardrail: declarative risk middleware. Position/leverage/notional caps,
// a three-state daily-loss circuit breaker, and a drawdown kill-switch, driven by the
// engine via the core GuardRail interface.

export { type GuardRailPolicy, DEFAULT_POLICY, validatePolicy } from "./policy.js";

export { type GuardRailState, type BreakerState, initState, updateState } from "./state.js";

export { applyGuardRail, PolicyGuardRail } from "./guardrail.js";
