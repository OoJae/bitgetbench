# CLAUDE.md - BitgetBench

This file grounds every Claude Code session on this repo. Read it first.

## Mission and win thesis

BitgetBench is an open-source (MIT) evaluation and paper-trading harness for agents built on the Bitget Agent Hub. The Agent Hub gives agents perception (analyst Skills) and execution (trading tools) but has no honest scoring, no sandbox, and no risk guardrails, and Bitget's own Playbook is closed beta. BitgetBench is the missing open trust layer: point any Agent Hub agent at it, and it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes results to a public leaderboard. It ships as a Claude Code skill so any contestant integrates an agent with one command.

We submit to the Trading Infra track (Track 2), framed as cross-track infrastructure, going for the cross-track first prize. The win condition is that other developers actually adopt it, which simultaneously produces the verifiable usage evidence (API calls, user count, sim-trade logs) the hackathon judges on. Solo developer.

## Hard rules (non-negotiable)

1. NEVER use em dashes anywhere: not in code, comments, strings, UI copy, commit messages, docs, README, or chat replies. Use hyphens or rephrase. This is a strict personal style rule. Treat any em dash as a bug. Enforced mechanically by `scripts/no-em-dash.mjs` (wired into `pnpm lint`).
2. TypeScript end to end. Do not introduce a Python service unless explicitly approved. Light quant math (Sharpe, drawdown, regression) stays in TS.
3. Sim only. BitgetBench never trades real capital and never requests write/trade API permissions. Read-only Bitget keys for public market data only.
4. Point-in-time discipline is sacred. All historical data access goes through one reader that returns only candles with `openTime <= the decision timestamp`. The replay loop must never bypass it. Fills execute at the next candle open, never same-bar.
5. Determinism and reproducibility. Same inputs produce same outputs. Seed any randomness. This is a credibility lever for judges.
6. Keep scope tight. Build the v1 "in" list only. Do not add LLM features, multi-exchange support, tokenized stocks, or a no-code builder in v1. Propose additions, do not just build them.
7. Ask-first on ambiguity. If a Bitget package name, endpoint, or command might have changed, stop and ask the user to verify it against the live Agent Hub repo README (https://github.com/Bitget-AI/agent_hub) rather than guessing.

## Stack and conventions

- Monorepo: pnpm workspaces.
- Language: TypeScript, strict mode. ESLint + Prettier. Vitest for tests, including property tests for the point-in-time reader.
- Leaderboard: Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts, deployed on Vercel.
- Database: Postgres (Neon or Supabase) via Drizzle ORM, with the same Drizzle schema runnable on SQLite for zero-setup local dev.
- CLI: a `bitgetbench` binary (commander), JSON output to match the Bitget `bgc` convention.
- Market data: Bitget public REST candles (no auth). Cache locally (ndjson + manifest) and in Postgres. Candles are immutable once closed; only append.
- Scheduling: cron on a Tencent Cloud VPS for the live paper-sandbox loop and leaderboard refresh.
- Conventional commits, small and frequent. No secrets in the repo; use env vars and a `.env.example`.

## Confirmed v1 decisions

- Market type: USDT-M futures. BTCUSDT USDT-M perpetual is the v1 target for candles and the sim engine. The fill simulator defaults to a linear-margin futures model; the buy-and-hold benchmark runs at leverage 1.
- Data endpoint approach: best-known Bitget v2 mix endpoints are coded as configurable constants isolated in `packages/data/src/bitgetFetch.ts`. They must be verified against live Bitget docs before any fetched dataset is trusted.

## Facts to verify live (time-sensitive, do not guess)

- Bitget public candle endpoint, param caps (per-call row limit), and history depth. Best-known: USDT-M futures `GET https://api.bitget.com/api/v2/mix/market/candles` and history `/api/v2/mix/market/history-candles` with `productType=USDT-FUTURES`; params `symbol`, `granularity`, `startTime`, `endTime`, `limit`.
- Current Bitget USDT-M taker fee. Best-known ~0.06% (6 bps). Store in config, never hard-code in logic.
- Agent Hub npm package + MCP command + Skill names (needed Phase 2). Brief lists `bitget-hub`, `bitget-mcp-server`, `bitget-skill-hub`, `bgc`. Verify against the live repo README before Phase 2.

## Monorepo layout

```
bitgetbench/
  packages/
    core/        engine: types, replay loop, portfolio, fill simulator, scoring, leak audit, hash-chained journal
    guardrail/   risk middleware: position/leverage caps, three-state daily-loss circuit breaker, drawdown kill-switch, declarative policy
    adapters/    BenchAgent interface + Bitget Agent Hub perception adapter + reference agents
    data/        Bitget candle fetch + cache + point-in-time reader
    cli/         bitgetbench commands: init, backtest, sim, submit, stats, verify
    skill/       Claude Code skill (SKILL.md + adapter scaffold templates)
  apps/
    leaderboard/ Next.js 15 app
  db/            Drizzle schema + migrations
  reference-agents/  SMA-crossover (no LLM) and Skill-driven momentum (uses Agent Hub Skills)
  data-cache/    gitignored
  CLAUDE.md
  README.md
  LICENSE        MIT
```

## Core interfaces (the integration contract)

Defined in `packages/core/src/types.ts`. The single surface a contestant implements is `BenchAgent`.

- `BenchAgent`: `{ name: string; decide(ctx: MarketContext): Promise<AgentDecision> }`.
- `MarketContext`: `{ timestamp; symbol; timeframe; candles (point-in-time, all openTime <= timestamp); position | null; equity }`.
- `AgentDecision`: `{ action: 'long'|'short'|'close'|'hold'; symbol; sizePct (0..1); leverage?; rationale (recorded verbatim); confidence? }`.
- `GuardRail`: `applyGuardRail(decision, state, policy) -> { allowed: AgentDecision; blocked: boolean; reasons: string[] }`. Pure and synchronous.
- `JournalEntry`: append-only, hash-chained with `sha256(seq | prevHash | timestamp | decision | verdict | fill | equityAfter)`. Expose `journalRoot` per run and a `verify` command.
- `RunResult`: agent/symbol/timeframe/window, full `Metrics`, a buy-and-hold benchmark `Metrics`, a decomposition `{ alpha, beta, marketReturn, skillReturn }`, and a `LeakCertificate { clean, maxLookaheadMs, checkedSteps, violations }`.
- `Metrics`: totalReturn, cagr, sharpe, sortino, maxDrawdown, calmar, winRate, profitFactor, expectancy, volatility, trades, exposure.
- `PointInTimeReader`: `getCandlesUpTo(symbol, timeframe, ts, opts?)` returns only candles with `openTime <= ts`. The single chokepoint against look-ahead.

## v1 scope: in vs out

In: leak-free backtest engine (point-in-time replay, fee + slippage fills, walk-forward), live paper-sandbox on the same engine, scoring + return decomposition, GuardRail module, hash-chained journal + verify, public Next.js leaderboard (ranking, agent detail with equity/drawdown charts, leak-free badge, journal root), telemetry (agents registered, backtests run, sim trades logged, API calls, distinct users), Claude Code skill + one-line init + README + two reference agents.

Out (v1, roadmap only): real-capital trading, no-code strategy builder, tokenized stocks, multi-exchange, on-chain journal anchoring.

Cut-scope ladder if behind: drop walk-forward + decomposition to a single in-sample run + benchmark line; drop hash-chaining to plain append-only; drop live sandbox to scheduled backtest re-runs; drop agent-detail pages to a single table. Non-negotiable core: backtest engine + leak audit + a public leaderboard with seeded agents + telemetry.

## Build phases and milestones

- Phase 0: generate CLAUDE.md, scaffold the monorepo, build the data layer (fetch + cache + point-in-time reader). Milestone 0: fetch and reload 6 months of BTCUSDT 15m candles deterministically; property test proves the reader never returns a future candle.
- Phase 1: core engine (portfolio, fill simulator with fees + slippage, replay loop, basic metrics) + the SMA-crossover reference agent. Milestone 1: buy-and-hold and SMA-crossover backtests produce correct, reproducible equity curves; buy-and-hold reconciles to asset return minus fees.
- Phase 2: rigor (leak audit + LeakCertificate, walk-forward, return decomposition), full scoring + a documented composite score, the BenchAgent adapter + Skill-driven reference agent, the GuardRail module, the hash-chained journal + verify, and the Claude Code skill + bitgetbench init. Milestone 2: a real Agent Hub agent is benchmarked end to end with a clean leak-free certificate, passes through guardrails, and writes a verifiable journal; a stranger could integrate from the README alone.
- Phase 3: the Next.js leaderboard on Vercel + the live paper-sandbox cron on the VPS (with heartbeat + Telegram alert on failure) + telemetry counters and /api/stats. Milestone 3: public leaderboard live with multiple real agents and incrementing counters, sandbox running unattended.
- Phase 4: flawless demo happy path, sustainability slide, README polish, <= 3 min demo video, submission package with all three evidence forms + community-post links. Freeze features by mid-phase.

## Definition of done

Public MIT repo a stranger can integrate in under five minutes; reproducible leak-audited backtests on real data for two reference agents plus one external agent; GuardRail clamps/blocks correctly and the journal verifies; a public Vercel leaderboard refreshed by an unattended VPS cron; real exportable telemetry; a flawless demo and a complete, submitted package before the deadline.

## Working agreement

- Ask before anything destructive, anything that spends money, or anything that uses write/trade API permissions.
- Keep a running changelog in `Notes.md` at the repo root, updated every turn.
- Stop at each milestone, show evidence, and propose the next task list before continuing.
