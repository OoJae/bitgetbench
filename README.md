# BitgetBench

Open-source (MIT) leak-free evaluation and paper-trading harness for agents built on the [Bitget Agent Hub](https://github.com/Bitget-AI/agent_hub).

The Agent Hub gives agents perception and execution but no honest scoring, no sandbox, and no risk guardrails. BitgetBench is the missing open trust layer: point any Agent Hub agent at it, and it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes results to a public leaderboard.

Sim only. BitgetBench never trades real capital and never requests write or trade API permissions. It uses public Bitget market data (no auth) and read-only keys only.

## Status

The engine is built: leak-free backtester, GuardRail, tamper-evident journal, scoring with return decomposition, two reference agents, and the `bitgetbench` CLI. The public leaderboard and live paper-sandbox land in Phase 3. See [CLAUDE.md](CLAUDE.md) for the full plan, [docs/methodology.md](docs/methodology.md) for how scoring works, and [Notes.md](Notes.md) for the changelog.

## The integration contract

A contestant implements one interface:

```ts
interface BenchAgent {
  name: string;
  decide(ctx: MarketContext): Promise<AgentDecision>;
}
```

`MarketContext` carries point-in-time candles (every `openTime <= ctx.timestamp`), the current sim position, and equity. `AgentDecision` is `{ action, symbol, sizePct, leverage?, rationale, confidence? }`. BitgetBench handles the rest: guardrails, fills, scoring, journaling, leaderboard.

## Integrate in 60 seconds

```bash
# 1. Scaffold an agent + config (writes bitgetbench.agent.mjs and a config)
bitgetbench init

# 2. Edit decide(ctx) in bitgetbench.agent.mjs

# 3. Run a leak-audited, benchmarked backtest and write the journal
bitgetbench backtest --config bitgetbench.config.json --journal run.journal.jsonl

# 4. Verify the journal's hash chain
bitgetbench verify run.journal.jsonl
```

The backtest prints full metrics, a buy-and-hold benchmark, an alpha/beta decomposition, a `leakCertificate`, a `journalRoot`, and the composite score. Perception inside `decide` should be point-in-time: derive features from `ctx.candles` (the `@bitgetbench/adapters` package ships `technicalFeatures` plus a `bgc` client for live data). Live Agent Hub analyst skills are live-only and excluded from backtests; see [docs/methodology.md](docs/methodology.md).

## Develop

```bash
pnpm install
pnpm -r build
pnpm lint
pnpm test

# Fetch 6 months of BTCUSDT 15m candles, then run the reference-agent smoke
pnpm --filter @bitgetbench/data fetch:smoke
pnpm --filter @bitgetbench/reference-agents backtest:smoke
```

## Repo layout

See [CLAUDE.md](CLAUDE.md#monorepo-layout).

## License

MIT. See [LICENSE](LICENSE).
