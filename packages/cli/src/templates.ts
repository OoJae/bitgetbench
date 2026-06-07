// Scaffold templates embedded in the CLI so `bitgetbench init` is self-contained (no need
// to locate files in another package at runtime). The agent template is plain ESM
// JavaScript so a contestant goes from zero to a backtest with no build step.

export const AGENT_TEMPLATE = `// Your BitgetBench agent. Implement decide(ctx) and return a decision.
// ctx.candles are point-in-time: every candle.openTime <= ctx.timestamp (no look-ahead).
// Decisions fill at the next candle open. See https://github.com/ for docs.

/** @typedef {import("@bitgetbench/core").MarketContext} MarketContext */
/** @typedef {import("@bitgetbench/core").AgentDecision} AgentDecision */

export const agent = {
  name: "my-agent",

  /** @param {MarketContext} ctx @returns {Promise<AgentDecision>} */
  async decide(ctx) {
    const closes = ctx.candles.map((c) => c.close);
    if (closes.length < 50) {
      return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "warming up" };
    }
    const sma = (n) => closes.slice(-n).reduce((s, x) => s + x, 0) / n;
    const fast = sma(20);
    const slow = sma(50);

    if (ctx.position === null && fast > slow) {
      return { action: "long", symbol: ctx.symbol, sizePct: 0.5, leverage: 1, rationale: "fast > slow" };
    }
    if (ctx.position !== null && fast < slow) {
      return { action: "close", symbol: ctx.symbol, sizePct: 0, rationale: "fast < slow" };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "no signal" };
  },
};

export default agent;
`;

export const CONFIG_TEMPLATE = `{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "market": "usdt-futures",
  "startEquity": 10000,
  "fees": { "takerFee": 0.0006 },
  "slippage": { "bps": 1 },
  "contextLookback": 200,
  "agent": "./bitgetbench.agent.mjs"
}
`;

export const README_SNIPPET = `# BitgetBench agent

Scaffolded by \`bitgetbench init\`.

1. Edit \`bitgetbench.agent.mjs\` (implement \`decide(ctx)\`).
2. Make sure candles are cached for your symbol/timeframe.
3. Run a leak-audited backtest:

   bitgetbench backtest --config bitgetbench.config.json

4. Verify a run's journal:

   bitgetbench verify run.journal.jsonl
`;
