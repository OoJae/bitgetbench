# Submission package

> TO CONFIRM in a live browser before submitting (the hackathon page is a JS app and the
> details are time-sensitive): exact track names and descriptions, the judging rubric wording,
> the submission platform and its required fields, and all milestone dates. Fill the bracketed
> placeholders below once confirmed.

## One-paragraph description

BitgetBench is an open-source (MIT) leak-free evaluation and paper-trading harness for agents built on the Bitget Agent Hub. It runs any agent through a point-in-time backtester (fees and slippage modeled, fills at the next candle open) and a live paper-trading sandbox on real Bitget USDT-M futures data, enforces risk guardrails on every decision, records a tamper-evident hash-chained journal, and publishes results to a public leaderboard with a transparent composite score. The whole integration surface is one interface, `BenchAgent`, and a contestant wires in with one command.

## The problem

The Agent Hub provides perception and execution but no honest scoring, no sandbox, and no risk guardrails; the Playbook is closed beta. Backtests routinely leak future data, ignore costs, and conflate market drift with skill. There is no open, trustworthy way to compare Agent Hub agents.

## Technical approach

- Point-in-time discipline: one reader returns only candles with `openTime <= decisionTs`; fills land at the next candle open; each run emits a `LeakCertificate` and a leak-dirty run scores 0.
- Deterministic engine: portfolio + fill simulator (0.06% taker fee + slippage), 12 metrics annualized, OLS alpha/beta decomposition, walk-forward folds, a documented composite score.
- GuardRail: position/leverage/notional caps, a three-state daily-loss circuit breaker, and a drawdown kill-switch, from a declarative JSON policy, applied between decision and fill and recorded in the journal.
- Tamper-evident journal: `sha256(seq|prevHash|...)` per step; `bitgetbench verify` recomputes the chain.
- Live sandbox: a 15-minute cron syncs new candles and re-runs the reference agents, updating a SQLite-backed Next.js leaderboard.

## Extensibility (how it uses the Agent Hub and how an agent plugs in)

- Verified Agent Hub packages: `bitget-hub`, `bitget-mcp-server`, `bitget-client` (CLI `bgc`), `bitget-core`, `bitget-skill`, `bitget-skill-hub`. The 5 analyst skills (macro-analyst, market-intel, news-briefing, sentiment-analyst, technical-analysis) are AI instructions over a live MCP, so they are live-only and excluded from leak-free backtests.
- An agent implements `BenchAgent.decide(ctx)`. For perception, `@bitgetbench/adapters` provides point-in-time `technicalFeatures` (SMA/EMA/RSI/MACD/ATR/momentum) and a read-only `bgc` client for live market data in the sandbox.
- `npx bitgetbench init` scaffolds a plain-ESM adapter and config; `bitgetbench backtest --submit` runs and posts to the board; `bitgetbench verify` proves journal integrity.

## Verifiable evidence (all three forms)

1. Auditable sim-trade logs: every run writes a hash-chained journal; the board shows the journal root and `bitgetbench verify` checks it.
2. API-call and usage telemetry: `/api/stats` and `bitgetbench stats` expose agents registered, backtests run, sandbox cycles, sim trades, API calls, and distinct users.
3. Real users: the leaderboard and the one-command integration are shared with the trading communities below; each contestant who runs an agent is a counted user.

Links to include in the form:

- Live leaderboard: [LIVE URL]
- Telemetry: [LIVE URL]/api/stats
- Public repo: https://github.com/OoJae/bitgetbench
- Demo video (<= 3 min): [VIDEO URL]

## Community posts (templates)

- Announcement: "Built BitgetBench for the Bitget AI Base Camp Hackathon: benchmark your Agent Hub trading agent honestly. Leak-free backtests, risk guardrails, a tamper-evident journal, and a public leaderboard. Free and open source, integrate in 3 commands. Live: [LIVE URL] Repo: https://github.com/OoJae/bitgetbench #BitgetHackathon @ the Bitget AI account"
- Recruiting contestants: "Running an agent in the hackathon? Put it on the public leaderboard in 3 commands and get a leak-free score + a verifiable journal: [LIVE URL]. Happy to help you integrate."

## Definition of done (status)

Public MIT repo a stranger can integrate in under five minutes (done); reproducible leak-audited backtests on real data for five reference agents (done); GuardRail clamps/blocks and the journal verifies (done); a public leaderboard refreshed by an unattended VPS cron (done); real exportable telemetry (done). Remaining: record the demo video, confirm the submission fields, post the community announcements.
