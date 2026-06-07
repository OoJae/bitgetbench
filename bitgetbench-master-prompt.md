# BitgetBench: Claude Code Master Prompt

Paste everything inside the fenced block below into Claude Code as your first message in a fresh project directory. It is written to be self-contained. After it runs Phase 0, refer Claude Code to `bitgetbench-build-plan.md` for the full per-component spec.

---

```
You are my senior engineering partner building a project called BitgetBench for the Bitget AI Base Camp Hackathon S1. I am a solo developer. We are going for the cross-track first prize. Read this entire brief, then follow the "Immediate task" section at the end. Ask me before doing anything destructive or anything that spends money or uses write/trade API permissions.

## Mission and win thesis
BitgetBench is an open-source (MIT) evaluation and paper-trading harness for agents built on the Bitget Agent Hub. The Agent Hub gives agents perception (analyst Skills) and execution (trading tools) but has no honest scoring, no sandbox, and no risk guardrails, and Bitget's own Playbook is closed beta. BitgetBench is the missing open trust layer: point any Agent Hub agent at it, and it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes results to a public leaderboard. It ships as a Claude Code skill so any contestant integrates an agent with one command. We submit to the Trading Infra track. The win condition is that other developers actually adopt it, which simultaneously produces the verifiable usage evidence (API calls, user count, sim-trade logs) the hackathon judges on.

## Hard rules (non-negotiable)
1. NEVER use em dashes anywhere: not in code, comments, strings, UI copy, commit messages, docs, README, or chat replies to me. Use hyphens or rephrase. This is a strict personal style rule. Treat any em dash as a bug.
2. TypeScript end to end. Do not introduce a Python service unless I explicitly approve it. Light quant math (Sharpe, drawdown, regression) stays in TS.
3. Sim only. BitgetBench never trades real capital and never requests write/trade API permissions. Read-only Bitget keys for public market data only.
4. Point-in-time discipline is sacred. All historical data access goes through one reader that returns only candles with openTime <= the decision timestamp. The replay loop must never bypass it. Fills execute at the next candle open, never same-bar.
5. Determinism and reproducibility. Same inputs produce same outputs. Seed any randomness. This is a credibility lever for judges.
6. Keep scope tight. Build the v1 "in" list only (below). Do not add LLM features, multi-exchange support, tokenized stocks, or a no-code builder in v1. If you think something is worth adding, propose it, do not just build it.
7. Ask-first on ambiguity. If a Bitget package name, endpoint, or command might have changed, stop and tell me to verify it against the live Agent Hub repo README rather than guessing.

## Stack and conventions
- Monorepo: pnpm workspaces.
- Language: TypeScript, strict mode. ESLint + Prettier. Vitest for tests, including property tests for the point-in-time reader.
- Leaderboard: Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts, deployed on Vercel.
- Database: Postgres (Neon or Supabase) via Drizzle ORM, with the same Drizzle schema runnable on SQLite for zero-setup local dev.
- CLI: a `bitgetbench` binary (commander), JSON output to match the Bitget `bgc` convention.
- Market data: Bitget public REST candles (no auth). Cache locally (parquet or csv) and in Postgres. Candles are immutable once closed; only append.
- Scheduling: cron on my Tencent Cloud VPS for the live paper-sandbox loop and leaderboard refresh.
- Conventional commits, small and frequent. No secrets in the repo; use env vars and a .env.example.

## Monorepo layout to create
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
  CLAUDE.md      project brief you will generate first
  README.md      install + integrate in 60 seconds
  LICENSE        MIT

## Core interfaces (the integration contract, flesh these out)
- BenchAgent: { name: string; decide(ctx: MarketContext): Promise<AgentDecision> } is the entire surface a contestant implements.
- MarketContext: { timestamp; symbol; timeframe; candles (point-in-time, all openTime <= timestamp); position | null; equity }.
- AgentDecision: { action: 'long'|'short'|'close'|'hold'; symbol; sizePct (0..1); leverage?; rationale (recorded verbatim); confidence? }.
- GuardRail: applyGuardRail(decision, state, policy) -> { allowed: AgentDecision; blocked: boolean; reasons: string[] }. Pure and synchronous.
- JournalEntry: append-only, hash-chained with sha256(seq | prevHash | timestamp | decision | verdict | fill | equityAfter). Expose journalRoot per run and a verify command.
- RunResult: agent/symbol/timeframe/window, full Metrics, a buy-and-hold benchmark Metrics, a decomposition { alpha, beta, marketReturn, skillReturn }, and a LeakCertificate { clean, maxLookaheadMs, checkedSteps, violations }.
- Metrics: totalReturn, cagr, sharpe, sortino, maxDrawdown, calmar, winRate, profitFactor, expectancy, volatility, trades, exposure.

## v1 scope: in vs out
In: leak-free backtest engine (point-in-time replay, fee + slippage fills, walk-forward), live paper-sandbox on the same engine, scoring + return decomposition, GuardRail module, hash-chained journal + verify, public Next.js leaderboard (ranking, agent detail with equity/drawdown charts, leak-free badge, journal root), telemetry (agents registered, backtests run, sim trades logged, API calls, distinct users), Claude Code skill + one-line init + README + two reference agents.
Out (v1): real-capital trading, no-code strategy builder, tokenized stocks, multi-exchange, on-chain journal anchoring. Mention these only as roadmap.
Cut-scope ladder if behind: drop walk-forward + decomposition to a single in-sample run + benchmark line; drop hash-chaining to plain append-only; drop live sandbox to scheduled backtest re-runs; drop agent-detail pages to a single table. Non-negotiable core: backtest engine + leak audit + a public leaderboard with seeded agents + telemetry.

## Build phases and milestones
- Phase 0 (now): generate CLAUDE.md from this brief, scaffold the empty monorepo (pnpm workspaces, lint, test, MIT, .env.example), and build the data layer (fetch + cache + point-in-time reader). Milestone 0: fetch and reload 6 months of BTCUSDT 15m candles deterministically; property test proves the reader never returns a future candle.
- Phase 1: core engine (portfolio, fill simulator with fees + slippage, replay loop, basic metrics) + the SMA-crossover reference agent. Milestone 1: buy-and-hold and SMA-crossover backtests produce correct, reproducible equity curves; buy-and-hold reconciles to asset return minus fees.
- Phase 2: rigor (leak audit + LeakCertificate, walk-forward, return decomposition), full scoring + a documented composite score, the BenchAgent adapter + Skill-driven reference agent, the GuardRail module, the hash-chained journal + verify, and the Claude Code skill + bitgetbench init. Milestone 2: a real Agent Hub agent is benchmarked end to end with a clean leak-free certificate, passes through guardrails, and writes a verifiable journal; a stranger could integrate from the README alone.
- Phase 3: the Next.js leaderboard on Vercel + the live paper-sandbox cron on the VPS (with heartbeat + Telegram alert on failure) + telemetry counters and /api/stats. Milestone 3: public leaderboard live with multiple real agents and incrementing counters, sandbox running unattended.
- Phase 4: flawless demo happy path, sustainability slide, README polish, <=3 min demo video, submission package with all three evidence forms + community-post links. Freeze features by mid-phase.

## Definition of done
Public MIT repo a stranger can integrate in under five minutes; reproducible leak-audited backtests on real data for two reference agents plus one external agent; GuardRail clamps/blocks correctly and the journal verifies; a public Vercel leaderboard refreshed by an unattended VPS cron; real exportable telemetry; a flawless demo and a complete, submitted package before the deadline.

## Immediate task (do this now, in order)
1. Confirm you have read and will obey the hard rules, especially the no-em-dash rule. List the hard rules back to me in one short line each so I know they are loaded.
2. Tell me exactly which facts you need me to verify in a live browser before we write code that depends on them (current Agent Hub npm package name and MCP command, the public Bitget candle endpoint and current taker fee, and anything else uncertain). Do not guess these; wait for me if they block you, but proceed on everything that does not.
3. Generate CLAUDE.md capturing this brief (mission, hard rules, stack, layout, interfaces, scope, phases, definition of done) so every future session is grounded.
4. Scaffold the empty monorepo per the layout above: pnpm workspaces, TypeScript strict, ESLint + Prettier, Vitest, MIT LICENSE, .env.example, a root README stub, and empty package skeletons with their package.json files and tsconfig references. Do not implement logic yet beyond stubs.
5. Implement packages/data: the Bitget public candle fetcher (with caching) and the point-in-time reader getCandlesUpTo(symbol, timeframe, ts), plus a property test that asserts it never returns a candle with openTime > ts. Then fetch and store 6 months of BTCUSDT 15m as a smoke test.
6. Stop at Milestone 0, show me the test output and the cached-data summary, and propose the Phase 1 task list before continuing.

Begin.
```

---

## How to use this

1. Do the Week 0 verifications first (see `bitgetbench-build-plan.md` Section 14): open the live hackathon page, confirm tracks/rubric/dates/submission platform, register, and read the current Agent Hub repo README so the package names and commands you give Claude Code are accurate.
2. Create an empty project directory, open Claude Code in it, and paste the fenced block above as your first message.
3. After Milestone 0, point Claude Code at `bitgetbench-build-plan.md` and work phase by phase, holding each milestone's acceptance criteria before moving on.
4. Keep the no-em-dash rule enforced; if Claude Code ever emits one in code or copy, treat it as a defect to fix.
5. Start the distribution push (Telegram seeding, recruiting other contestants to run their agents) in Phase 3, not at the end. The adopter count is what wins Track 2, and it takes time to compound.
