# BitgetBench

[![CI](https://github.com/OoJae/bitgetbench/actions/workflows/ci.yml/badge.svg)](https://github.com/OoJae/bitgetbench/actions/workflows/ci.yml)

Open-source (MIT) leak-free evaluation and paper-trading harness for agents built on the [Bitget Agent Hub](https://github.com/Bitget-AI/agent_hub).

The Agent Hub gives agents perception and execution but no honest scoring, no sandbox, and no risk guardrails. BitgetBench is the missing open trust layer: point any Agent Hub agent at it, and it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes results to a public leaderboard.

**Sim only.** BitgetBench never trades real capital and never requests write or trade API permissions. It uses public Bitget market data (no auth) and read-only keys only.

## Why

Backtests routinely lie: they leak future data, ignore fees and slippage, and conflate market drift with skill. BitgetBench refuses to. Point-in-time data access is the single chokepoint, fills land at the next candle open, every run carries a leak certificate, and a run that is not leak-clean scores 0. The result is a leaderboard you can trust, and the integration is one interface.

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
# 1. Scaffold an agent + config (writes bitgetbench.agent.mjs, plain ESM, no build step)
npx bitgetbench init

# 2. Edit decide(ctx) in bitgetbench.agent.mjs

# 3. Run a leak-audited, benchmarked backtest, write the journal, submit to the board
bitgetbench backtest --config bitgetbench.config.json --journal run.journal.jsonl --submit

# 4. Verify the journal's hash chain
bitgetbench verify run.journal.jsonl
```

The backtest prints full metrics, a buy-and-hold benchmark, an alpha/beta decomposition, a `leakCertificate`, a `journalRoot`, and the composite score. Inside `decide`, derive perception from `ctx.candles` (the `@bitgetbench/adapters` package ships `technicalFeatures` plus a read-only `bgc` client for live data). Live Agent Hub analyst skills are live-only and excluded from backtests; see [docs/methodology.md](docs/methodology.md).

## Architecture

```
  Agent Hub agent ->  BenchAgent.decide(ctx)  ->  BitgetBench core
                                                   - point-in-time data reader (the leak chokepoint)
                                                   - replay loop (fills at next open)
                                                   - GuardRail (caps, circuit breaker, kill-switch)
                                                   - metrics + return decomposition + composite score
                                                   - hash-chained journal
                                                            |
                                                   SQLite (runs, trades, telemetry)
                                                            |
                                                   Next.js leaderboard  +  live sandbox cron
```

## Live leaderboard and evidence

Live: **https://bitgetbench.vercel.app** (telemetry at https://bitgetbench.vercel.app/api/stats).

The public leaderboard (ranking, per-agent detail with equity/drawdown charts, leak-free badges, journal roots) and the live counters are served on Vercel, with the data and an unattended 15-minute sandbox cron running on a VPS. `/api/stats` exposes the telemetry counters, and `bitgetbench verify` proves any run's journal integrity.

## Develop

```bash
pnpm install
pnpm -r build      # packages
pnpm build:web     # leaderboard
pnpm lint
pnpm test

# Fetch 6 months of BTCUSDT 15m candles, then run the reference-agent smoke
pnpm --filter @bitgetbench/data fetch:smoke
pnpm --filter @bitgetbench/reference-agents backtest:smoke
```

## Layout

```
packages/core         engine: types, replay loop, portfolio, fills, scoring, leak audit, journal
packages/guardrail    risk middleware (caps, circuit breaker, kill-switch, declarative policy)
packages/data         Bitget candle fetch + cache + point-in-time reader + live poller
packages/adapters     point-in-time indicators + read-only bgc client
packages/cli          the bitgetbench binary (init, backtest, verify, seed, stats, sandbox)
packages/skill        the Claude Code skill (SKILL.md)
reference-agents      buy-and-hold, SMA-crossover, skill-momentum, RSI-reversion, breakout
apps/leaderboard      Next.js 15 leaderboard
db                    persistence (node:sqlite, Postgres-ready)
deploy                systemd + nginx + provisioning for the VPS
docs                  methodology, demo script, sustainability, submission
```

## Roadmap

Postgres + Vercel at scale, multi-symbol and walk-forward views on the leaderboard, an LLM-in-the-loop live agent, and on-chain anchoring of the journal root. See [docs/sustainability.md](docs/sustainability.md).

## License

MIT. See [LICENSE](LICENSE).
