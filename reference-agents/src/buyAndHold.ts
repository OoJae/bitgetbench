// Buy-and-hold: the benchmark baseline. Goes fully long at leverage 1 on the first
// decision, then holds forever. Run through the same engine as any agent, so the
// benchmark Metrics come from one code path and reconcile to asset return minus the
// single entry fee.

import type { BenchAgent, MarketContext, AgentDecision } from "@bitgetbench/core";

export class BuyAndHoldAgent implements BenchAgent {
  readonly name: string;

  constructor(name = "buy-and-hold") {
    this.name = name;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null) {
      return {
        action: "long",
        symbol: ctx.symbol,
        sizePct: 1,
        leverage: 1,
        rationale: "Buy and hold: enter full long at leverage 1 and never exit.",
      };
    }
    return {
      action: "hold",
      symbol: ctx.symbol,
      sizePct: 0,
      rationale: "Buy and hold: maintain the position.",
    };
  }
}
