# BitgetBench

Open-source (MIT) leak-free evaluation and paper-trading harness for agents built on the [Bitget Agent Hub](https://github.com/Bitget-AI/agent_hub).

The Agent Hub gives agents perception and execution but no honest scoring, no sandbox, and no risk guardrails. BitgetBench is the missing open trust layer: point any Agent Hub agent at it, and it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes results to a public leaderboard.

Sim only. BitgetBench never trades real capital and never requests write or trade API permissions. It uses public Bitget market data (no auth) and read-only keys only.

## Status

Phase 0 (data layer). This is early. The integration contract, backtest engine, leaderboard, and Claude Code skill are landing across Phases 1 to 4. See [CLAUDE.md](CLAUDE.md) for the full plan and [Notes.md](Notes.md) for the changelog.

## The integration contract

A contestant implements one interface:

```ts
interface BenchAgent {
  name: string;
  decide(ctx: MarketContext): Promise<AgentDecision>;
}
```

`MarketContext` carries point-in-time candles (every `openTime <= ctx.timestamp`), the current sim position, and equity. `AgentDecision` is `{ action, symbol, sizePct, leverage?, rationale, confidence? }`. BitgetBench handles the rest: guardrails, fills, scoring, journaling, leaderboard.

## Develop

```bash
pnpm install
pnpm -r build
pnpm lint
pnpm test
```

## Repo layout

See [CLAUDE.md](CLAUDE.md#monorepo-layout).

## License

MIT. See [LICENSE](LICENSE).
