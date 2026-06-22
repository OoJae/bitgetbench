// Reference BenchAgents for BitgetBench: a buy-and-hold benchmark and a deterministic
// SMA-crossover strategy. The Skill-driven momentum agent lands in Phase 2.
export { BuyAndHoldAgent } from "./buyAndHold.js";
export { SmaCrossoverAgent, type SmaCrossoverConfig } from "./smaCrossover.js";
export { SkillMomentumAgent, type SkillMomentumConfig } from "./skillMomentum.js";
export { RsiReversionAgent, type RsiReversionConfig } from "./rsiReversion.js";
export { BreakoutAgent, type BreakoutConfig } from "./breakout.js";
export {
  validateSpec,
  specToAgent,
  specHash,
  STRATEGY_KINDS,
  SPEC_LIMITS,
  type StrategySpec,
  type StrategyKind,
} from "./strategySpec.js";
