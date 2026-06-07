# BitgetBench: Comprehensive Build Plan

> Companion to `bitgetbench-strategy.md` (the why) and `bitgetbench-master-prompt.md` (the Claude Code kickoff). This document is the how: everything that needs to be built, in what order, with acceptance criteria.

---

## 0. One-paragraph definition

BitgetBench is an open-source (MIT), npm-installable evaluation and paper-trading harness for agents built on the Bitget Agent Hub. It does the one thing the Agent Hub does not: it scores agents honestly. You point any Agent Hub agent at BitgetBench, it runs that agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, records a tamper-evident trade journal, and publishes the results to a public leaderboard. It ships as a Claude Code skill so any contestant wires their agent in with one command. The win thesis: in Track 2 the success metric (other devs adopt it) is identical to the judging evidence metric (API calls, user count, sim-trade logs), and it is useful to Track 1 and Track 3 contestants too, so it is the only single build that compounds cross-track.

---

## 1. Win-condition mapping

Keep this table taped to the wall. Every feature exists to satisfy a row.

| Judging criterion (per brief, re-confirm live) | How BitgetBench satisfies it |
|---|---|
| Demo must be real and runnable, no concept-only | A CLI + a live public leaderboard that anyone can run and watch update. Judges run one command or scan a QR. |
| Clear answer to what problem it solves | Agent Hub has perception and execution but no honest scoring, no sandbox, no guardrails. Playbook is closed beta. BitgetBench is the open trust layer. |
| Track 2: other developers integrate with low friction | One-line install, a single `BenchAgent` interface to implement, a Claude Code skill that scaffolds the adapter for them. |
| Track 2: genuinely solves a pain point, not reproducing existing tools | No open leak-free evaluator/sandbox/leaderboard exists for Agent Hub. This is net-new. |
| Verifiable usage evidence (sim logs OR API volume OR user count) | All three at once: auditable sim-trade journals, API-call telemetry, real user count from Telegram communities and other contestants. |
| Cross-track "wow" | Other contestants' agents appear on your leaderboard. A judge sees the whole hackathon ranked inside your tool. |

---

## 2. Scope: v1 in, explicitly out

**In (v1, the four weeks):**
- Leak-free backtest engine (point-in-time replay, fee + slippage fills, walk-forward).
- Paper-trading sandbox (live Bitget data, scheduled runs, same engine).
- Scoring + return decomposition (Sharpe, Sortino, max drawdown, Calmar, win rate, profit factor, expectancy, CAGR, alpha/beta vs buy-and-hold).
- GuardRail module (position cap, leverage cap, daily-loss circuit breaker, drawdown kill-switch, JSON audit trail).
- Tamper-evident trade journal (append-only, hash-chained).
- Public leaderboard (Next.js 15, Vercel): rankings, per-agent detail, equity curve, trade log, leak-free certificate badge.
- Telemetry (agents registered, backtests run, sim trades logged, API calls).
- Claude Code skill + one-line install + README + 2 reference agents.

**Out (do not build in v1, say so on the sustainability slide as roadmap):**
- Real-capital live trading. Never. Sim only. Removes risk and matches the rules.
- A strategy authoring UI or no-code builder (that is the closed Playbook's lane).
- Tokenized-stock support (Track 3 plumbing); leave as a documented extension point.
- Multi-exchange support; Bitget only for v1.
- On-chain settlement of the journal; hash-chain in Postgres is enough for the demo, mention zk/on-chain anchoring as roadmap.

**Cut-scope ladder (if behind schedule, drop from the bottom up):**
1. Walk-forward and return decomposition become "single in-sample run + benchmark line."
2. Hash-chaining becomes plain append-only logs.
3. Live paper-sandbox becomes "scheduled backtest re-runs" only.
4. Leaderboard becomes a single-page table with no per-agent detail pages.
The non-negotiable core that must ship no matter what: backtest engine + leak audit + a public leaderboard with at least your own seeded agents + telemetry.

---

## 3. Architecture overview

```
                         +---------------------------+
                         |   Bitget Agent Hub        |
                         |  (perception Skills +     |
                         |   58 execution tools,     |
                         |   via MCP / bgc CLI)      |
                         +-------------+-------------+
                                       |
                       agent uses Skills for perception
                                       |
+------------------+        +----------v-----------+        +--------------------+
|  Contestant's    | adapts |   BenchAgent         | feeds  |  BitgetBench Core  |
|  Agent Hub agent +------->|   interface          +------->|  - data layer (PIT)|
|  (any logic)     |        |   decide(ctx)        |        |  - replay loop     |
+------------------+        +----------------------+        |  - fill simulator  |
                                       ^                     |  - GuardRail       |
                                       |                     |  - scoring         |
                            GuardRail wraps every decision   |  - journal (hash)  |
                                                             +----------+---------+
                                                                        |
                                            results + journal + telemetry
                                                                        |
                                                             +----------v---------+
                                                             |  Postgres          |
                                                             |  (runs, trades,    |
                                                             |   metrics, stats)  |
                                                             +----------+---------+
                                                                        |
                                                             +----------v---------+
                                                             |  Next.js 15        |
                                                             |  leaderboard       |
                                                             |  (Vercel)          |
                                                             +--------------------+
```

**Two run modes, one engine:**
- **Backtest:** replay stored historical candles, point-in-time enforced, deterministic, fast. Used for the leaderboard's headline ranking and the leak-free certificate.
- **Paper-sandbox:** the same replay loop driven by live Bitget candles on a cron (Tencent VPS), recording decisions and simulated fills in real time. Used for the "live, updating, anyone-can-watch" demo moment.

---

## 4. Tech stack and rationale (opinionated)

- **Language: TypeScript end to end.** One language, one deploy story, fastest iteration with Claude Code, matches your existing stack. The backtest math (PnL accounting, Sharpe, drawdown, regression) is light enough for TS; rigor comes from methodology, not from being written in Python. Do not split the core into a Python service; it adds a deploy surface you do not need in four weeks.
- **Monorepo: pnpm workspaces.** Mirrors the Agent Hub's own layout, clean package boundaries, one install.
- **Leaderboard: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Recharts**, deployed on Vercel. This is your home turf.
- **Database: Postgres** (Neon or Supabase, both Vercel-native). You already know pgvector, so Postgres is comfortable. Use Drizzle ORM for typed schema and migrations. SQLite via the same Drizzle schema for zero-setup local runs.
- **CLI: a `bitgetbench` binary** (commander or a thin wrapper), JSON output to match `bgc` conventions.
- **Agent perception: the Bitget Agent Hub MCP server + Skills**, called by the agent being benchmarked, not by BitgetBench itself. BitgetBench stays perception-agnostic.
- **Market data: Bitget public REST candles** (no auth needed for public OHLCV) for historical pulls and live polling. Read-only API keys only, never trade permissions.
- **Scheduling: cron on the Tencent VPS** for the paper-sandbox loop and the leaderboard refresh.
- **Optional, only if time allows:** a tiny Python sidecar using `empyrical`/`pandas` to cross-check the TS metrics. Nice for credibility, not required. Do not block on it.

---

## 5. Monorepo layout

```
bitgetbench/
├── packages/
│   ├── core/            # engine: types, replay loop, portfolio, fill sim, scoring, leak audit, journal
│   ├── guardrail/       # risk middleware (position/leverage caps, circuit breaker, kill-switch)
│   ├── adapters/        # BenchAgent interface + Bitget Agent Hub adapter + reference agents
│   ├── data/            # Bitget candle fetch + cache + point-in-time access layer
│   ├── cli/             # `bitgetbench` commands: init, backtest, sim, submit, stats
│   └── skill/           # Claude Code skill (SKILL.md + adapter scaffold templates)
├── apps/
│   └── leaderboard/     # Next.js 15 app (App Router) + Drizzle + Recharts
├── db/                  # Drizzle schema + migrations (shared by core and leaderboard)
├── reference-agents/    # 2 example BenchAgents (SMA-crossover, Skill-driven momentum)
├── data-cache/          # local OHLCV parquet/csv cache (gitignored)
├── CLAUDE.md            # project brief for Claude Code (generated first)
├── README.md            # install + integrate in 60 seconds
├── LICENSE              # MIT
└── package.json         # pnpm workspace root
```

---

## 6. Core abstractions

These interfaces are the contract. Get them right early; everything else hangs off them. Sketches below are illustrative, Claude Code will flesh them out.

```typescript
// The single interface a contestant implements. This is the whole integration surface.
export interface BenchAgent {
  name: string;
  // BitgetBench guarantees ctx contains NO data after ctx.timestamp.
  decide(ctx: MarketContext): Promise<AgentDecision>;
}

export interface MarketContext {
  timestamp: number;          // decision time (ms)
  symbol: string;             // e.g. "BTCUSDT"
  timeframe: string;          // e.g. "15m"
  candles: Candle[];          // point-in-time: every candle.openTime <= timestamp
  position: Position | null;  // current sim position, if any
  equity: number;             // current sim equity (USDT)
  // Agents call Agent Hub Skills themselves for richer perception (sentiment, macro, etc.)
}

export interface AgentDecision {
  action: 'long' | 'short' | 'close' | 'hold';
  symbol: string;
  sizePct: number;            // intended fraction of equity (0..1), pre-guardrail
  leverage?: number;          // pre-guardrail
  rationale: string;          // recorded verbatim in the journal
  confidence?: number;        // optional, 0..1
}

export interface Candle {
  openTime: number; open: number; high: number; low: number; close: number; volume: number;
}

export interface Position { side: 'long' | 'short'; sizeUsd: number; entry: number; leverage: number; }

// GuardRail returns the decision it actually allows, plus an audit record.
export interface GuardRailVerdict {
  allowed: AgentDecision;     // possibly clamped or downgraded to 'hold'
  blocked: boolean;
  reasons: string[];          // why it was clamped/blocked
}

// One immutable journal entry per step, hash-chained.
export interface JournalEntry {
  seq: number;
  prevHash: string;
  timestamp: number;
  decision: AgentDecision;
  verdict: GuardRailVerdict;
  fill: Fill | null;
  equityAfter: number;
  hash: string;               // sha256(seq|prevHash|timestamp|decision|verdict|fill|equityAfter)
}

export interface Fill { price: number; sizeUsd: number; feeUsd: number; slippageBps: number; }

export interface RunResult {
  agent: string; symbol: string; timeframe: string;
  startTs: number; endTs: number; startEquity: number; endEquity: number;
  metrics: Metrics;
  benchmark: Metrics;         // buy-and-hold over the same window
  decomposition: { alpha: number; beta: number; marketReturn: number; skillReturn: number };
  leakCertificate: LeakCertificate;
  journalRoot: string;        // final hash of the chain
}

export interface Metrics {
  totalReturn: number; cagr: number; sharpe: number; sortino: number;
  maxDrawdown: number; calmar: number; winRate: number; profitFactor: number;
  expectancy: number; volatility: number; trades: number; exposure: number;
}

export interface LeakCertificate {
  clean: boolean; maxLookaheadMs: number; checkedSteps: number; violations: number;
}
```

---

## 7. Component-by-component build spec

### 7.1 Data layer (`packages/data`)
- Fetch Bitget public candles (REST, no auth) for a symbol + timeframe + date range, paginate, dedupe, sort ascending by `openTime`, persist to the local cache (parquet or csv) and/or Postgres.
- Expose a **point-in-time reader**: `getCandlesUpTo(symbol, timeframe, ts)` returns only candles with `openTime <= ts`. This is the single chokepoint that prevents look-ahead; the replay loop must never bypass it.
- Provide a live poller for paper-sandbox mode (poll latest closed candle on the timeframe boundary).
- Cache invalidation: candles are immutable once closed; only append.
- Acceptance: pull 6 months of BTCUSDT 15m, store, and reload deterministically; `getCandlesUpTo` never returns a future candle (unit-tested with property tests).

### 7.2 Backtest engine (`packages/core`)
- Replay loop: iterate timestamps from start to end on the timeframe grid. At each step build `MarketContext` via the point-in-time reader, call `agent.decide`, pass through GuardRail, simulate the fill, update the portfolio, append a journal entry.
- **Fill simulator:** fills execute at the next candle open (no same-bar fills, avoids a classic leak). Apply Bitget taker fee (confirm current rate) and a slippage model (bps scaled by recent volatility or a fixed conservative default, configurable). Support both spot-style and futures-style (leverage, liquidation check) sims; default to a simple linear-margin futures model.
- **Portfolio accounting:** track cash, position, unrealized/realized PnL, equity curve sampled per step. Handle flips (long to short closes then opens). Enforce that size after guardrail never exceeds available margin.
- Determinism: same inputs, same outputs, fixed RNG seed if any randomness. Reproducibility is a judging credibility lever.
- Acceptance: a buy-and-hold agent's return equals the asset's return over the window minus fees; an always-hold agent ends flat; a known SMA-crossover produces a stable, reproducible equity curve.

### 7.3 Rigor layer (`packages/core`)
- **Leak audit:** wrap the point-in-time reader so every data access during a `decide` call is recorded; assert max accessed `openTime <= ctx.timestamp`. Aggregate into a `LeakCertificate`. If any violation, the run is flagged and the leaderboard shows no "leak-free" badge.
- **Walk-forward:** split the window into rolling in-sample/out-of-sample folds; report out-of-sample metrics separately. This is the single most credibility-boosting feature for quant-literate judges.
- **Return decomposition:** regress per-step agent returns on benchmark (buy-and-hold) returns to estimate alpha and beta; report market-driven vs skill-driven return split. Cite the rationale (LiveTradeBench-style: separate drift from skill).
- Acceptance: an agent that just mirrors buy-and-hold shows beta ~1 and alpha ~0; a market-neutral noise agent shows beta ~0.

### 7.4 Scoring (`packages/core`)
- Compute the full `Metrics` set from the equity curve and trade list. Annualize Sharpe/Sortino correctly for the timeframe. Define a single transparent **composite score** for the default ranking (document the formula publicly; e.g. a weighted blend of out-of-sample Sharpe, max drawdown penalty, and a fee-adjusted return), but let users sort by any raw metric.
- Acceptance: metrics match a Python `empyrical` cross-check within tolerance on a fixed equity curve.

### 7.5 GuardRail module (`packages/guardrail`)
- Pure, synchronous middleware: `applyGuardRail(decision, state, policy) -> GuardRailVerdict`. No network, fully testable.
- Policies: max position size (% equity), max leverage, max concurrent exposure, daily-loss circuit breaker (three states: closed allows trading, open blocks all new risk, half-open allows reduced size after a cooldown), drawdown kill-switch (hard stop at a configured equity drawdown), optional per-symbol allow/deny.
- Every clamp or block produces human-readable `reasons` recorded in the journal.
- Ship a small declarative policy format (JSON/YAML) so users tune limits without code; this is the AgentSpec-style "rules as config" angle and a strong safety-narrative talking point.
- Acceptance: feeding oversized/over-leveraged decisions yields clamped output; tripping the daily loss limit blocks subsequent new-risk decisions until cooldown; kill-switch forces close + halt.

### 7.6 Trade journal (`packages/core`)
- Append-only, hash-chained (`hash = sha256(seq | prevHash | ...)`). Store in Postgres and export as JSONL. The final `journalRoot` is shown on the leaderboard so a run's integrity is verifiable.
- Acceptance: tampering with any entry breaks the chain; recomputing hashes detects it. Provide a `bitgetbench verify <run>` command.

### 7.7 Live paper-sandbox runner (`packages/cli` + VPS cron)
- Same engine, driven by the live poller. On each timeframe boundary: fetch the just-closed candle, build context, run all registered agents, apply guardrails, record fills and journal, update Postgres, trigger leaderboard revalidation.
- Heartbeat: log a health record each cycle (data feed ok, agent latency, errors). If a cycle fails, retry then alert (Telegram bot message to you).
- Acceptance: runs unattended for 48h on the VPS, leaderboard reflects new sim trades each cycle, no missed boundaries.

### 7.8 Adapter + Agent Hub integration (`packages/adapters`)
- `BenchAgent` interface (Section 6) plus a helper that lets an agent call Bitget Agent Hub Skills/tools for perception inside `decide` (thin wrappers over the MCP server or `bgc`).
- Two reference agents in `reference-agents/`:
  1. **SMA-crossover** (no LLM, pure rules): proves the harness and gives a deterministic baseline.
  2. **Skill-driven momentum** (calls `sentiment-analyst` + `technical-analysis` Skills, lets an LLM decide): proves real Agent Hub integration and gives judges a "this benchmarks actual AI agents" story.
- Acceptance: both reference agents run end to end in backtest and sim; the Skill-driven one demonstrably consumes Agent Hub perception.

### 7.9 Claude Code skill (`packages/skill`)
- A `SKILL.md` plus templates so a contestant opens Claude Code and says "integrate my agent with BitgetBench." The skill scaffolds an adapter implementing `BenchAgent`, wires perception, and runs a first backtest.
- One-line install path: `npx bitgetbench init` scaffolds the adapter and a config; document an alternative MCP/skill registration.
- Acceptance: a fresh agent goes from zero to a first backtest + a leaderboard entry in under five minutes, following only the README.

### 7.10 Leaderboard (`apps/leaderboard`)
- Next.js 15 App Router. Pages: `/` (global ranking table, sortable, with the live telemetry counters at the top), `/agent/[id]` (equity curve via Recharts, drawdown chart, trade table, metric breakdown, leak-free badge, journal root + verify instructions), `/about` (the methodology + composite-score formula, for credibility).
- Data: read Postgres via Drizzle in server components; revalidate on a short interval or on sandbox-cycle webhook. No client-side secret usage.
- Public, shareable, mobile-first (your community is on phones). A prominent QR on the demo points here.
- Acceptance: deployed on Vercel at a public URL; a new sim cycle is visible within the revalidation window; pages render fast on mobile.

### 7.11 Telemetry / evidence layer
- Count and surface: agents registered, backtests run, sim trades logged, cumulative API calls, distinct users. Store events in Postgres; show live counters on the leaderboard home.
- Provide a `bitgetbench stats` command and a `/api/stats` endpoint that returns the same numbers (for your submission writeup and demo).
- Acceptance: counters increment in real time as you and others run agents; numbers are exportable for the submission.

---

## 8. Phased timeline (4 weeks) with milestones

Dates below are placeholders; map them to the confirmed schedule once verified. Assume the submission window opens mid-June and closes late June per the brief.

### Week 0: Setup and de-risk (2-3 days)
- Confirm in a live browser: exact tracks, prize tiers, judging rubric wording, submission platform, all dates. Register the team. Join the official Telegram. Repost the official interaction post (needed for the Community Impact Award and to start your evidence trail).
- Install Agent Hub: `npx bitget-hub upgrade-all --target claude`; create read-only API keys; register the MCP server in Claude Code; smoke-test `bgc` and at least two Skills on the Tencent VPS.
- Scaffold the monorepo (pnpm workspaces), CI lint/test, MIT license, and have Claude Code generate `CLAUDE.md` from the master prompt.
- **Milestone 0:** `bgc` returns live Bitget data on the VPS; the empty monorepo builds and lints; you can fetch and store 6 months of BTCUSDT 15m candles.

### Week 1: Engine core
- Build `packages/data` (fetch, cache, point-in-time reader) and `packages/core` (portfolio, fill simulator with fees + slippage, replay loop, basic metrics).
- Wire the SMA-crossover reference agent.
- **Milestone 1:** run buy-and-hold and SMA-crossover through a backtest on real data; get a correct, reproducible equity curve and a basic metrics table; buy-and-hold return reconciles to asset return minus fees.

### Week 2: Rigor, adapter, guardrail, skill
- Add leak audit + `LeakCertificate`, walk-forward, return decomposition, full scoring + composite score.
- Finalize the `BenchAgent` interface; build the Agent Hub adapter and the Skill-driven momentum reference agent.
- Build `packages/guardrail` (limits, three-state circuit breaker, kill-switch, declarative policy) and the hash-chained journal + `bitgetbench verify`.
- Ship `packages/skill` (Claude Code skill) and `bitgetbench init`.
- **Milestone 2:** a real Agent Hub agent (using a perception Skill) is benchmarked end to end, produces a clean leak-free certificate, runs through guardrails, and writes a verifiable journal. A second person could integrate an agent from the README alone.

### Week 3: Leaderboard, live-sim, telemetry, adopters
- Build and deploy the Next.js leaderboard on Vercel (ranking, agent detail, charts, badges, methodology page).
- Stand up the live paper-sandbox cron on the VPS + heartbeat + Telegram alerts.
- Instrument telemetry counters and `/api/stats`.
- **Distribution push:** seed real users from your Nigerian/Kenyan/SA Telegram groups; recruit 3-5 other hackathon contestants to run their agents through BitgetBench (this is the killer cross-track evidence). Post build-in-public updates tagged #BitgetHackathon and @ the Bitget AI account.
- **Milestone 3:** public leaderboard live with multiple real agents (yours + at least a few external), live counters incrementing, the sandbox running unattended.

### Week 4: Polish, evidence, submission
- Make the demo flawless: a clean happy path (QR to live leaderboard, watch a cycle update, open an agent detail, show the leak-free badge and verify command).
- Write the sustainability slide: open infra Bitget can absorb into Agent Hub; emerging-market GTM; roadmap (stocks, multi-exchange, on-chain journal anchoring).
- Finalize README (install + integrate in 60 seconds), record a tight demo video (<= 3 min), assemble the submission with all three evidence forms (sim logs + user count + API telemetry) and the community-post links.
- Buffer for bugs. Freeze features by mid-Week 4.
- **Milestone 4 (Definition of Done):** see Section 12.

---

## 9. Verifiable-evidence playbook (the decisive criterion)

Stack all three; most contestants produce zero or one.

1. **Auditable sim-trade logs (always available, zero risk):** every backtest and sandbox cycle writes a hash-chained journal. Surface the count and the `journalRoot` per run. This alone satisfies the baseline.
2. **Real user count (your moat):** put the leaderboard and the `init` flow in front of your Telegram communities. Even passive viewers + a handful of agent submitters generate a credible, honest user number. Track distinct users in telemetry.
3. **API-call telemetry (compounds with adoption):** count every Agent Hub call your runs trigger and every BitgetBench CLI/API invocation. If other contestants adopt it, this number climbs on its own.

GTM specifics: announce in 2-3 of your active groups with a one-line value prop ("benchmark your hackathon agent honestly, free, open source"), a 60-second Loom, and the public leaderboard link. Offer to personally help the first few contestants integrate (concierge onboarding drives the adopter count that wins Track 2). Keep a running tally for the submission writeup.

---

## 10. Demo and submission checklist

**Demo (the thing judges actually score):**
- [ ] Public leaderboard URL loads fast on mobile and desktop.
- [ ] A QR code on screen points to it.
- [ ] One command (`npx bitgetbench init` or a single backtest) runs live in under a minute.
- [ ] A sandbox cycle visibly updates the leaderboard during the demo window.
- [ ] An agent detail page shows equity curve, drawdown, trade log, leak-free badge, journal root.
- [ ] `bitgetbench verify <run>` proves journal integrity on camera.
- [ ] External contestants' agents are visible on the board.

**Submission package (per the brief, re-confirm exact fields):**
- [ ] Public GitHub repo, MIT, with a README that gets a dev integrated in 60 seconds (Track 2 requires a runnable repo + complete README).
- [ ] Demo video, <= 3 minutes, showing core functionality + a real integration.
- [ ] Project description: the problem, the technical approach, extensibility notes (which Agent Hub modules/Skills it uses, how an agent plugs in).
- [ ] Verifiable evidence: link the live leaderboard, the telemetry stats endpoint, and the sim-trade journals; state the user count and API-call volume.
- [ ] Community posts: repost the official interaction post and publish your project intro tagged #BitgetHackathon and @ the Bitget AI account; include the links (qualifies for the Community Impact Award and the Participation Award).

---

## 11. Risk register and decision points

| Risk | Trigger | Action |
|---|---|---|
| Backtester still leaks or is wrong by end of W2 | Milestone 2 missed | Cut to sim-sandbox + leaderboard only; drop walk-forward and decomposition (cut-scope ladder). |
| Telegram adoption slow by W3 | < ~10 distinct users / 0 external agents | Lean on API-call telemetry + self-run agents; run more reference agents to populate the board honestly (label them as reference). |
| Rubric forbids external-platform evidence | Discovered at live re-confirm | Move all telemetry on-platform (Bitget sim accounts); host the leaderboard but mirror evidence into the submission form. |
| Agent Hub package names/commands changed | Install fails in W0 | Read the live repo README; the npm package and MCP command names in the brief are time-sensitive, use whatever the repo currently documents. |
| Bitget candle endpoint rate limits / changes | Data pulls fail | Cache aggressively, back off, and pin to the public market-data endpoint the repo or docs currently use. |
| Scope creep (LLM features, multi-exchange) | You start "just adding" things | Freeze to Section 2 "In" list. The win is depth on one tool, not breadth. |
| Profitability framing backfires | You claim your agents make money | Foreground evaluation + safety, not returns. Alpha Arena showed even GPT-5 lost 60%. Honesty reads as credibility to serious judges. |

---

## 12. Definition of Done

BitgetBench v1 is done when all of the following are true:
1. A public GitHub repo (MIT) builds clean and a stranger can integrate an agent in under five minutes from the README.
2. The backtest engine produces reproducible, leak-audited results with a `LeakCertificate`, on real Bitget data, for at least the two reference agents plus one external agent.
3. GuardRail clamps/blocks correctly and the hash-chained journal verifies with `bitgetbench verify`.
4. A public Next.js leaderboard is live on Vercel with rankings, per-agent detail, charts, and badges, refreshed by a sandbox cron running unattended on the VPS.
5. Telemetry shows real, exportable numbers for agents registered, backtests run, sim trades logged, API calls, and distinct users.
6. The demo runs flawlessly on the happy path, and the submission package (repo, <=3 min video, description, evidence links, community posts) is complete and submitted before the deadline.

---

## 13. Setup commands (Week 0 reference)

Re-confirm every command against the live Agent Hub README before relying on it; these are from the brief and are time-sensitive.

```bash
# Agent Hub: install + register MCP for Claude Code
npx bitget-hub upgrade-all --target claude

# Read-only credentials (create on bitget.com > Settings > API Management, Read only)
export BITGET_API_KEY="your-read-only-key"
export BITGET_SECRET_KEY="your-secret"
export BITGET_PASSPHRASE="your-passphrase"

# Register the MCP server in Claude Code
claude mcp add -s user \
  --env BITGET_API_KEY=$BITGET_API_KEY \
  --env BITGET_SECRET_KEY=$BITGET_SECRET_KEY \
  --env BITGET_PASSPHRASE=$BITGET_PASSPHRASE \
  bitget -- npx -y bitget-mcp-server

# Smoke-test the CLI and a Skill
bgc --help

# Scaffold BitgetBench (pnpm workspace)
pnpm init
# ... create packages/* and apps/leaderboard per Section 5, then:
pnpm install
pnpm -r build
```

---

## 14. Verification TODOs (do these in a live browser before building)

- [ ] Exact track names, descriptions, and the Track 2 judging rubric wording.
- [ ] Confirmed prize tiers and the cross-track #1 mechanic.
- [ ] Submission platform and exact submission fields.
- [ ] All milestone dates (registration close, submission open/close, judging, results).
- [ ] Current Agent Hub npm package names, MCP command, and Skill list (the repo README is source of truth).
- [ ] Current Bitget public candle endpoint + rate limits + current taker fee.
- [ ] Whether external-hosted evidence (your Vercel leaderboard) is acceptable, or evidence must be on-platform.
- [ ] Eligibility/KYC and any region constraints from your jurisdiction.
