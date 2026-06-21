# BitgetBench Notes

Running development log. Newest entries on top. One section per working turn: what was done, decisions, and a changelog.

---

## 2026-06-22 - Brand system + landing page

### Summary

Applied the Claude Design brand to the whole site and added a marketing landing page. The brand is a monochrome editorial system (Void black / Ink off-white, Archivo + Space Mono, no color accent) with a live three.js liquid-chrome hero mark. `/` is now the landing; the ranking table moved to `/leaderboard`. All four pages are on-brand. No backend changes.

### What was done

- Foundation: Tailwind tokens (void/carbon/ink/bone), Archivo + Space Mono via next/font, globals (void bg, selection, ticker/blink keyframes, smooth scroll), film grain + scroll progress mounted in the layout.
- Brand components (`components/brand/`): Kicker, SectionLabel, PillButton, CodeChip, LiveDot, LeakTag, Ticker, CornerTicks, SparkLine, Clock, Reveal (IntersectionObserver), FilmGrain, ScrollProgress, SiteHeader/SiteFooter/Shell.
- `ChromeBlob.tsx`: faithful React port of the brand's three.js liquid-chrome mark (noise-deformed icosahedron, procedural chrome matcap, idle rotation + scroll/pointer reaction), with a static gradient fallback. `three` + `@types/three` added to the leaderboard.
- Landing (`app/page.tsx`): hero (chrome blob + nav + tagline + "how it works"), "BACKTESTS LIE.", the five-chokepoints harness, a live top-5 leaderboard preview (real data) with sparklines + a telemetry ticker, the integrate section (BenchAgent code + 4 steps), and the "RUN YOUR AGENT." footer CTA. Reveal-on-scroll throughout. ISR (revalidate 60).
- Restyled: `/leaderboard` (new, the old `/` table on-brand with sparklines + ticker + heartbeat dot), `/run/[id]` (corner-tick chart frames, mono labels, kept the id-decode + ISR fixes), `/about` (numbered method sections), and `Charts.tsx` recolored to monochrome. Removed the old `Counters`/`Badge` components.
- Docs: README/demo/submission updated for the new routes (site root = landing, board = `/leaderboard`).

### Decisions

- Strict monochrome per the brand: dropped the green/red P&L colors (returns convey sign by +/- and weight; status uses a blinking dot, never color). One-line revert if color is wanted back.
- three.js loads only on the landing route (the hero is client-only; SSR renders the static fallback). The Claude Design runtime (x-dc/x-import/support.js) is not used; visuals are reimplemented in React/Tailwind. `brandfiles/` is gitignored (and excluded from lint/em-dash) since the design HTML contains em dashes.

### Evidence

- Gates green: typecheck, build, build:web, lint (no-em-dash, 130 files), test (87/87), format:check.
- Local smoke (SQLite mode): `/` (landing sections + chrome blob), `/leaderboard`, `/about`, `/run/<colon-id>` all 200 with content.

### Deploy (done)

- Committed `3a56082` ("feat: brand system + landing page"), pushed; CI green on that SHA.
- Vercel production deploy READY. Live verified: `/` (hero tagline, BACKTESTS, five chokepoints, RUN YOUR AGENT) ~1s, `/leaderboard` (real agents: breakout-20, skill-momentum), `/about`, and a real `/run/<id>` all 200.
- VPS rsynced + reprovisioned (`bitgetbench-web` active); public landing 200 and on-brand. Vercel remains the primary URL; the VPS still serves the unchanged data API + the sandbox cron.

---

## 2026-06-22 - Hotfix: Vercel site not loading

Two issues surfaced after the Vercel deploy and both are fixed and live.

1. Slow/hanging loads: Vercel renders in US-East but the data backend (VPS) is in Asia, and pages fetched it on every request with no timeout, so the cross-region hop made pages slow or hang. Fix: ISR (`revalidate = 60`) on the pages + a cached, 8s-timeout server-side fetch, so users get an instant cached page and the VPS is polled in the background (empty board fallback if the VPS is briefly down). Home now loads in ~1.4s.
2. Run-detail pages 404'd: Next hands page params URL-encoded and does not decode them (route handlers do), so run ids containing ":" (the deterministic `sandbox:*` and `seed:*` ids) arrived as `sandbox%3A...` and missed the lookup. Fix: decode the id on the run page. Run pages now 200 with full content. (Latent since deterministic seeding in Phase 4; the API was always fine.)

Verified live: https://bitgetbench.vercel.app home + run-detail pages 200, content renders. Gates green, VPS redeployed.

## 2026-06-19 - Phase 4.5: CI, telemetry fix, Vercel URL

### Summary

Tied up the loose ends the user picked and added a clean public Vercel URL. The leaderboard is now live at https://bitgetbench.vercel.app (Vercel renders the UI, fetches data server-side from the VPS which stays the source of truth + cron). CI runs the gates on GitHub.

### What was done

- CI: `.github/workflows/ci.yml` runs install + typecheck + build + build:web + lint (no-em-dash) + test + format:check on push/PR; README CI badge added.
- Removed the `SKILL_PLACEHOLDER` stub (now exports `SKILL_ID`); set the LICENSE author.
- Telemetry: `getStats.sandboxCycles` now derives from the heartbeat count (one heartbeat per cycle), retiring the inflated `sandbox_cycle` event count (the live number dropped from ~1848 to the real ~866). db test updated.
- Data-source switch: `apps/leaderboard/lib/data.ts` reads SQLite on the VPS (dynamic import of @bitgetbench/db, keeping node:sqlite out of any serverless bundle) or fetches the VPS JSON server-side when `BITGETBENCH_API_BASE` is set. Added `/api/runs` and `/api/run/[id]` JSON routes. Pages + stats route made async.
- VPS redeployed so it serves the JSON API.
- Vercel: project `oojaes-projects/bitgetbench`, Root Directory set to `apps/leaderboard` via the API (so a repo-root deploy builds the app in monorepo context; the subdir-upload and prebuilt-pnpm-tracing paths both failed, remote build from root works). Deployment Protection disabled for a public board. Env: `BITGETBENCH_API_BASE=http://<vps-ip>` (server-side fetch, no mixed content), `NEXT_PUBLIC_SITE_URL=https://bitgetbench.vercel.app` (QR). Verified the Vercel URL renders all 5 agents + stats from the VPS, hero + QR present.
- Docs: README/demo/submission now use https://bitgetbench.vercel.app as the primary public link (clean, no IP).

### Decisions

- "Vercel UI, VPS data" (not Postgres): the VPS SQLite + cron stays the single source of truth; Vercel is a thin server-side-rendered client. Postgres remains the documented scale path.
- Vercel monorepo deploy: set Root Directory server-side via the REST API using the authed CLI token, then deploy from the repo root for full-monorepo build context. Prebuilt deploys are unreliable with pnpm symlink tracing.
- The Vercel env holds the VPS IP; the repo stays IP-free.

### Status

Definition of Done met on the build side. Live: https://bitgetbench.vercel.app and (origin) the VPS. Remaining human tasks unchanged: record the <=3 min video, confirm hackathon submission fields, post the community announcements (templates with the URL inlined in docs/submission.md), recruit a first external agent.

---

## 2026-06-14 - Phase 4: polish, docs, public repo (Milestone 4 / submission)

### Summary

Made BitgetBench submission-ready: scrubbed the VPS IP out of tracked files and parameterized deploy config, added two more reference agents, polished the live leaderboard (hero + integrate CTA + QR), wrote the README + sustainability + demo + submission docs, redeployed, and published the public repo. Five reference agents now rank on the live board with the hero and QR rendering.

### Decisions

- Public repo `OoJae/bitgetbench`, IP scrubbed first: the VPS address lives only in a gitignored `deploy/.env` (with `.env.example` committed); nginx `server_name` is a `__BENCH_SERVER_NAME__` token that `provision.sh` substitutes; the systemd service reads an `EnvironmentFile`. The web build inlines `NEXT_PUBLIC_SITE_URL` for the QR. Git history still contains the IP from earlier commits (a server IP is not a secret); history rewrite was offered but not done.
- Two new deterministic, leak-free reference agents: RSI mean-reversion and Donchian breakout, reusing the point-in-time indicators. Seeding is now idempotent (deterministic `seed:<agent>` ids) so re-seeding upserts.
- Fixed a telemetry double-count: `sandbox_cycle` is now recorded once per cycle (not once per agent).
- Feature freeze: no new engine features beyond the two agents.

### What was built

- `deploy/`: `.env.example` + gitignored `.env`, `EnvironmentFile` in the systemd unit, token-substituted nginx vhost, `provision.sh` reads `deploy/.env` and bakes `NEXT_PUBLIC_SITE_URL` into the build.
- `reference-agents/`: `RsiReversionAgent`, `BreakoutAgent`; both wired into `seed` and `sandbox` via a shared `referenceAgents()` in the CLI.
- `db/repo.ts`: optional explicit `id` on `RunInsert` for idempotent seeds.
- `apps/leaderboard`: home hero (value prop + three integrate commands + methodology link) and a QR (`qrcode.react`, shown only when `NEXT_PUBLIC_SITE_URL` is set).
- Docs: README rewrite (problem, contract, 60-second integrate, ascii architecture, layout, roadmap), `docs/sustainability.md`, `docs/demo.md` (sub-3-min script + shot list), `docs/submission.md` (problem, approach, extensibility, three evidence forms, community-post templates, hackathon fields marked TO CONFIRM).

### Milestone 4 evidence

- Gates green: typecheck, build, build:web, lint (no-em-dash, 116 files), test (87/87), format:check.
- Live board redeployed: `/api/stats` shows 5 agents registered, leaderboardSize 10 (5 backtest + 5 sandbox), fresh ok heartbeat; the home page renders the hero, all five agents, and the QR ("scan to open").
- Public repo published at github.com/OoJae/bitgetbench; IP not present in tracked files.

### Remaining human tasks (handed off)

- Record the <= 3 min demo video (script in docs/demo.md).
- Confirm the live hackathon submission fields (tracks, rubric, dates, platform) and fill the placeholders in docs/submission.md.
- Post the community announcements (templates in docs/submission.md) and recruit contestants to run their agents.
- Optional: a domain + certbot TLS; set `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in deploy/.env for sandbox failure alerts.

---

## 2026-06-09 - Phase 3: persistence, leaderboard, live sandbox, deploy (Milestone 3)

### Summary

Made BitgetBench public and live. Persistence + telemetry (Block D), the Next.js leaderboard (Block E), and the live paper-sandbox + VPS deploy (Block F) are all in. Milestone 3 is met: a public leaderboard is live at http://<vps-ip>/ with multiple real agents and incrementing counters, and the sandbox runs unattended on a 15-minute cron with a heartbeat.

### Decisions

- Database: pivoted from Drizzle + better-sqlite3 to Node's built-in `node:sqlite` with raw parameterized SQL. better-sqlite3's native addon does not build against the current Node (26); the built-in driver is zero-dependency and works everywhere. Loaded via `createRequire` so Vite/Vitest do not choke on the new builtin. DDL is a mechanical Postgres port. CLAUDE.md updated.
- Hosting: the VPS (Sonar-VPS, <vps-ip>, Ubuntu 24.04) hosts both the leaderboard (Next.js via `next start` on localhost:3939 behind nginx) and the sandbox cron. No Vercel handoff.
- Non-destructive deploy: the VPS already runs other services (ports 80/443/3000 in use, an nginx `sonar` site). The leaderboard binds localhost:3939 (3000 was taken) and nginx serves it on the bare IP only via an IP-scoped server block (no default_server), leaving the host's `sonar.my.id` vhost untouched. The bare IP on port 80 now serves BitgetBench.
- Sandbox model: the cut-scope-ladder "scheduled backtest re-runs" sandbox. Each cycle syncs newly closed candles into the cache and re-runs the three reference agents over the live-updated window, upserting their sandbox rows. Deterministic and unattended.
- Telemetry honesty: cumulative counters (backtests run, sandbox cycles, api calls) come from a telemetry_events table; distinct users = distinct anonymous client ids (a random UUID at ~/.bitgetbench/client-id, no PII); sim trades = sum of trades across sandbox runs; agents registered = distinct agent names on the board.

### What was built

- Block D (db + cli): `db/` on node:sqlite (WAL) with runs, trades, telemetry_events, heartbeats; ingest/query helpers (insertRun upserts sandbox runs under a stable id, equity downsampled to 500 points); CLI `backtest --submit`, `stats`, `seed`. 5 db tests.
- Block E (apps/leaderboard): Next.js 15 App Router + Tailwind + Recharts reading the DB in dynamic server components. Pages: `/` (ranking + live counters + heartbeat dot + leak-free badges), `/run/[id]` (equity + drawdown charts, full metrics, benchmark, alpha/beta, journal root + verify, trades), `/about` (methodology), `/api/stats`.
- Block F (poller + sandbox + deploy): `syncRecentCandles` live poller (3 tests); `bitgetbench sandbox` cycle (sync, re-run agents, upsert sandbox rows, heartbeat, optional Telegram alert); `deploy/` (systemd unit, start-web launcher on :3939, IP-scoped nginx proxy, idempotent provision.sh). Provisioned the VPS: installed Node 24 + pnpm, built, seeded, wired the service + nginx + cron.

### Milestone 3 evidence

- Gates green: typecheck, build, lint (no-em-dash, 110 files), test (87/87), format:check.
- Public: `curl http://<vps-ip>/` returns 200 (Next.js); `/api/stats` returns leaderboardSize 6, sandboxCycles incrementing, simTrades ~1238, a fresh ok heartbeat. The board renders 6 runs (3 backtest + 3 sandbox, "live" tag) with leak-free badges.
- Unattended: systemd `bitgetbench-web` enabled + active; cron `*/15 * * * * bitgetbench sandbox` installed; sandbox log writing.

### Notes / follow-ups

- The bare IP (port 80) now serves BitgetBench; the host's `sonar.my.id` domain still routes to the existing `sonar` app. To revert, remove `/etc/nginx/sites-enabled/bitgetbench` and reload nginx.
- No TLS on the IP (the demo uses http). A domain + certbot would add https.
- Updates: rsync the repo to /opt/bitgetbench and re-run `deploy/provision.sh`.

### Distribution materials (for the user to post; Track 2 evidence)

- One-liner: "BitgetBench: benchmark your Bitget Agent Hub trading agent honestly. Leak-free backtests, risk guardrails, a tamper-evident journal, and a public leaderboard. Free and open source. Integrate in 3 commands." Link http://<vps-ip>/
- Demo script (under 60s): open the leaderboard, point at the live counters + heartbeat, open a run detail (equity/drawdown + leak-free badge + journal root), then `bitgetbench init && bitgetbench backtest --config bitgetbench.config.json --submit` to show a new entry appear.

### Next: Phase 4 (demo polish, sustainability slide, <=3 min video, submission package). Proposed below.

---

## 2026-06-07 - Phase 2 Blocks B + C: GuardRail, Agent Hub adapter, skill, CLI (Milestone 2)

### Summary

Completed Phase 2. GuardRail middleware (Block B) and the Agent Hub integration layer + Claude Code skill + `bitgetbench` CLI (Block C) are in. Milestone 2 is met: an agent is benchmarked end to end with a clean leak certificate, passes through guardrails, and writes a verifiable journal, and a stranger can integrate from the README in three commands.

### Block B: GuardRail (packages/guardrail)

- `policy.ts`: declarative `GuardRailPolicy` (position/leverage/notional caps, daily-loss limit, breaker cooldown + half-open factor, drawdown kill, symbol allow/deny) + `DEFAULT_POLICY` + `validatePolicy`.
- `state.ts`: `GuardRailState` + pure `updateState` (UTC day roll, equity peak, kill-switch, three-state breaker closed -> open -> half-open).
- `guardrail.ts`: pure `applyGuardRail` + stateful `PolicyGuardRail` implementing the core `GuardRail` interface.
- Engine integration: `runBacktest` gained an optional `guardrail`; it calls `onStep(equity, ts)` then `apply(decision)` between the decision and the fill, sizing from `verdict.allowed` and recording the verdict in the journal. A `GuardRail` interface was added to core so the engine uses it without a core -> guardrail cycle.
- Tests: clamping, notional cap, breaker open/half-open/re-arm, kill-switch terminal force-close, symbol gating, and an in-engine integration test (aggressive 10x agent clamped to 3x, clamp recorded in the journal).

### Block C: Agent Hub adapter, reference agent, skill, CLI

- `packages/adapters`: `indicators.ts` (point-in-time SMA/EMA/RSI/MACD/ATR/momentum + `technicalFeatures` snapshot, leak-safe) and `bitgetHub.ts` (`BitgetHubClient`, a read-only `bgc` wrapper for LIVE perception that degrades gracefully when bgc is absent).
- `reference-agents/src/skillMomentum.ts`: `SkillMomentumAgent`, a deterministic agent over `technicalFeatures` (MACD/momentum/RSI). Proves the Agent-Hub-style integration while staying leak-free.
- `packages/skill/SKILL.md`: the Claude Code skill ("integrate my agent with BitgetBench") with the contract, steps, and the rules that keep results trustworthy.
- `packages/cli`: the `bitgetbench` binary (commander). `init` (scaffold a plain-ESM agent + config + readme, no build step), `backtest --config [--journal]` (dynamic-import the agent, run `runBenchmarked` on the cache, print the full RunResult JSON), `verify <journal.jsonl>` (recompute the hash chain). Implementations in `index.ts`, wiring in `bin.ts`.
- `README.md`: a 60-second integrate path. `docs/methodology.md`: added the GuardRail section.

### Decisions

- The skill-driven reference agent is deterministic over candle-derived technical features, not LLM-in-loop, so it produces a clean leak certificate over 17k bars reproducibly (rule 5). LLM-in-loop is a live-sandbox roadmap item.
- The scaffolded agent is plain ESM JavaScript so a contestant goes zero-to-backtest with no TypeScript toolchain.
- CLI `backtest` dynamic-imports the agent module (default or `agent` export, or a factory).

### Tests (Vitest), 26 new this phase, 79 total passing

- guardrail.test.ts (9), engineIntegration.test.ts (1), indicators.test.ts (12), cli.test.ts (4) added to the Block A suite.

### Milestone 2 evidence

- typecheck, build, lint (no-em-dash, 84 files), test (79/79), format:check all green.
- End-to-end CLI demo (built binary, temp dir, real cache): `init` scaffolded 3 files; `backtest` produced leakCertificate { clean: true, checkedSteps 17279, violations 0 }, benchmark + decomposition (beta 0.216) + composite score, journalRoot 5fa7fed1...; `verify` returned ok on the intact 17279-entry journal and `{ ok: false, brokenAt: 5000 }` (exit 1) after tampering one entry.
- Reference-agent smoke: buy-and-hold, SMA 20/50, and skill-momentum all leak-clean. Skill-momentum at 2x overtraded (1014 trades) and lost 78.8% in the down market, reported honestly with composite score -0.60. SMA decomposition: beta 0.43, skill return -22.5%.

### Next: Phase 3 (leaderboard + live sandbox + telemetry), proposed below.

---

## 2026-06-07 - Phase 2 Block A: rigor + journal

### Summary

Added the rigor and tamper-evidence layers to the engine: leak certificate, hash-chained journal + verify, return decomposition, walk-forward, a documented composite score, and the full benchmarked `RunResult`. Verified Agent Hub package/MCP/Skill names against the live repo (see below). All gates green, 53 tests, and a backtest smoke that emits a clean leak certificate plus a 17,279-entry journal that verifies and breaks under tampering.

### Agent Hub names verified (2026-06-07, live repo raw README + skill-hub)

- Packages: `bitget-hub` (installer), `bitget-mcp-server` (MCP), `bitget-client` (CLI binary `bgc`), `bitget-core`, `bitget-skill`, `bitget-skill-hub`.
- `bgc` JSON commands, `--read-only` disables writes. 5 analyst skills: macro-analyst, market-intel, news-briefing, sentiment-analyst, technical-analysis.
- Key finding: the analyst skills are AI instructions that drive a live market-data MCP, NOT programmatic JSON APIs, and serve live data. So they are live-only and excluded from leak-free backtests. CLAUDE.md updated to mark this verified.

### Decisions

- Leak-free backtests exclude live analyst-skill perception (sentiment/macro/news) because it cannot be replayed point-in-time; backtest perception is candle-derived only. Documented in docs/methodology.md as a deliberate rigor stance.
- Leak certificate computed inline in the replay loop (max context openTime - decisionTs must be <= 0; fill bar strictly later). A run that is not leak-clean scores 0 on the composite (gate, not tunable).
- Composite score published: 0.5*clamp(sharpe/3) + 0.3*(1 - maxDD) + 0.2\*clamp(totalReturn), gated on leak-clean.
- Core stays free of any dependency on data and reference-agents: `runBenchmarked` uses an internal buy-and-hold benchmark; annualization uses inferred stepMs.

### What was built (packages/core)

- `leakAudit.ts`: `LeakAuditor` (inline in the engine) + `wrapReaderWithAudit` for external readers.
- `journal.ts`: `Journal` (hash-chained, sha256 over canonical JSON), `verifyJournal`, `stableStringify`, `GENESIS_HASH`.
- `decomposition.ts`: OLS `regress` + `decomposeReturns` (alpha, beta, market vs skill return).
- `walkForward.ts`: N non-overlapping out-of-sample folds + aggregate.
- `score.ts`: `compositeScore` + published `SCORE_WEIGHTS`.
- `runBenchmarked.ts`: agent + internal buy-and-hold benchmark + decomposition + leak cert + journal + score -> full `RunResult`.
- `engine.ts`: now records the leak certificate and hash-chained journal per step (trivial pass-through verdict until GuardRail lands in Block B); `BacktestRun` gained `leakCertificate`, `journal`, `journalRoot`; `RunResult` gained `score`.
- `portfolio.ts`: captures `lastFill` for the journal.
- `docs/methodology.md`: point-in-time discipline, leak policy, fees/slippage, metrics, decomposition, walk-forward, composite score, journal, determinism.

### Tests (Vitest), 18 new, 53 total passing

- `journal.test.ts`: chain integrity, tamper detection on any field and on the hash, empty-safe, stableStringify order-independence.
- `rigor.test.ts`: LeakAuditor clean/violation cases + cheating-reader wrap; regress beta1/alpha0 and flat-agent beta0; decomposition split; compositeScore gating and term weights; walk-forward fold coverage; runBenchmarked RunResult assembly.

### Block A evidence

- typecheck, build, lint (no-em-dash, 71 files), test (53/53), format:check all green.
- backtest smoke on cached 6-month data:
  - SMA 20/50: leak clean (0 violations), composite score -0.3609, beta 0.4291, market return -14.54%, skill return -22.51%, benchmark -33.89%, journal 17279 entries, root 4ea298b6...
  - buy-and-hold reconciles (diff 5.55e-17) PASS, determinism PASS, leak clean PASS, journal verifies PASS, tamper caught PASS.

### Next: Block B (GuardRail) then Block C (Agent Hub adapter + skill-momentum agent + Claude Code skill + bitgetbench CLI).

---

## 2026-06-07 - Phase 1: backtest engine core (Milestone 1)

### Summary

Built the deterministic, leak-safe backtest engine on top of the data layer and added the first two reference agents. Milestone 1 is met: buy-and-hold reconciles to asset return minus the taker fee to machine epsilon (abs diff 5.55e-17), and two identical runs produce identical equity curves.

### Decisions

- USDT-M taker fee confirmed by user at 0.06% (0.0006); stored as `DEFAULT_TAKER_FEE` in core, never hard-coded in logic.
- Market model: single-symbol linear USDT-M futures. `equity = cash + unrealizedPnL`. Open commits `margin = sizePct * equity` (equity equals cash when flat), `notional = margin * leverage`, `qty = notional / fillPrice`. Taker fee charged on open and close.
- Decision/fill timing (leak-safe): at bar i the agent sees only candles with openTime <= candles[i].openTime, and the order fills at candles[i+1].open, so the fill bar is strictly after everything the agent saw. No same-bar fills.
- Action semantics are target-position with no churn: `long`/`short` open or flip, hold if already on that side; `close` exits; `hold` is a no-op.
- Slippage: configurable bps applied adversely. Reconciliation uses 0 bps so buy-and-hold equals asset return minus fee exactly.
- Open-at-end position is marked to the final close in equity (no exit fee) and recorded as one synthetic closed trade for metrics, keeping equity and metrics consistent.
- `packages/core` has no dependency on `packages/data`: annualization uses `stepMs` inferred from candle spacing.
- Reference agents live in a new top-level `reference-agents` workspace package, matching the brief layout.

### What was built

- `packages/core/src/types.ts`: added engine types (Trade, EquitySample, FeeConfig, SlippageConfig, EngineConfig, BacktestRun).
- `packages/core/src/fills.ts`: `fillPrice`, `takerFeeUsd`, `simulateFill`. Pure.
- `packages/core/src/portfolio.ts`: `Portfolio` class (open/close, long+short PnL, fees, settle-at-end, liquidation hook via equity check), records `Trade`s.
- `packages/core/src/metrics.ts`: `computeMetrics` (all 12 metrics, annualized, divide-by-zero guarded), plus `stepReturns`, `maxDrawdown`.
- `packages/core/src/engine.ts`: `runBacktest` replay loop, reads candles only via the reader, fills at next open, samples equity per bar, conservative liquidation, final settle.
- `packages/core/src/index.ts`: exports the engine surface + `DEFAULT_TAKER_FEE`.
- `reference-agents/`: new `@bitgetbench/reference-agents` package with `BuyAndHoldAgent`, `SmaCrossoverAgent` (config fast/slow, long/flat or long/short), and `scripts/backtest-smoke.ts`. Wired into `pnpm-workspace.yaml` and the root `tsconfig.json`.
- Root `build` script broadened from `packages/*` to `-r` so `reference-agents` builds too.

### Tests (Vitest), 20 new, 35 total passing

- `fills.test.ts`: slippage direction/magnitude, fee, simulateFill bundle.
- `portfolio.test.ts`: long and short PnL net of fees, open-while-open guard, close-then-open flip, synthetic settle does not change cash.
- `metrics.test.ts`: maxDrawdown, flat-curve zeros (no NaN), totalReturn + exposure passthrough, winRate/profitFactor/expectancy, infinite profit factor with no losses.
- `engine.test.ts`: always-hold ends flat with 0 trades; buy-and-hold reconciliation to 1e-12; determinism (identical curves); leak-safety probe (agent never sees a candle at or beyond its decision bar); throws on < 2 candles.

### Milestone 1 evidence

- `pnpm typecheck`, `pnpm build`, `pnpm lint` (no-em-dash clean, 62 files), `pnpm test` (35/35), `pnpm format:check` all green.
- `pnpm --filter @bitgetbench/reference-agents backtest:smoke` on the cached 6-month data:
  - Buy-and-hold: end equity 6611.52, total return -33.88%, max drawdown 39.20%, 1 trade, 100% exposure.
  - SMA crossover 20/50 (1 bp slippage): end equity 6295.19, total return -37.05%, sharpe -2.83, 209 trades, 48.6% exposure, win rate 25.4%.
  - Reconciliation: asset return -33.8248%, expected (minus 0.06% fee) -33.8848%, actual -33.8848%, abs diff 5.55e-17, PASS.
  - Determinism: two runs identical, PASS.
  - Both strategies lost money because BTC fell ~34% over the window. This is the honest result; the project foregrounds evaluation rigor, not profitability.

### Next: proposed Phase 2 task list (awaiting sign-off)

1. Leak audit + `LeakCertificate`: wrap the reader to record max accessed openTime per decide call, aggregate maxLookaheadMs and violations.
2. Walk-forward: rolling in-sample/out-of-sample folds, report out-of-sample metrics separately.
3. Return decomposition: regress agent per-step returns on buy-and-hold to estimate alpha/beta and split market vs skill return; assemble the full `RunResult`.
4. Composite score: one documented, transparent ranking formula.
5. GuardRail module (`packages/guardrail`): position/leverage caps, three-state daily-loss circuit breaker, drawdown kill-switch, declarative JSON policy, integrated into the replay loop.
6. Hash-chained journal + `bitgetbench verify`.
7. Agent Hub perception adapter + Skill-driven momentum reference agent (verify Agent Hub package/MCP/Skill names against the live repo first).
8. Claude Code skill + `bitgetbench init`.

---

## 2026-06-07 - Phase 0: scaffold + data layer (Milestone 0)

### Summary

Stood up the monorepo from an empty directory and built the data layer end to end. Milestone 0 is met: 6 months of BTCUSDT 15m USDT-M futures candles fetched from live Bitget, cached deterministically, and a property-tested point-in-time reader that never returns a future candle.

### Decisions

- Market type for v1: USDT-M futures (BTCUSDT perpetual). Confirmed with user.
- Endpoint approach: best-known Bitget v2 mix endpoints coded as configurable constants isolated in `packages/data/src/bitgetFetch.ts`, to be verified before trusting data. Confirmed with user.
- Cache format: NDJSON (one candle per line, ascending) plus a `manifest.json` carrying coverage range, row count, and a sha256 of the NDJSON. Chosen over parquet to avoid a native dep; trivial to serialize deterministically in pure TS.
- Hard rule 1 (no em dashes) is enforced mechanically by `scripts/no-em-dash.mjs`, wired into `pnpm lint`.

### Endpoint verification status

- The live smoke fetch returned 17,280 contiguous 15m candles with zero gaps and correct-looking OHLCV, so the candle endpoint path and response row shape (`[openTime, open, high, low, close, baseVol, quoteVol]`) are empirically validated for USDT-M futures.
- STILL TO VERIFY against live Bitget docs before Phase 1 fill simulator: current USDT-M taker fee (best-known ~0.06% / 6 bps) and the published per-call row cap + history depth limits (we used limit=200 and it worked across 87 paged calls).
- Agent Hub package/MCP/Skill names remain unverified; not needed until Phase 2.

### What was built

- `CLAUDE.md`: full project brief for future sessions (mission, hard rules, stack, layout, interfaces, scope, phases, definition of done).
- Monorepo root: `pnpm-workspace.yaml`, root `package.json` (scripts: build, typecheck, lint, format, test, check:no-em-dash), `tsconfig.base.json` (strict, composite, project refs) + root `tsconfig.json`, ESLint flat config + Prettier, `scripts/no-em-dash.mjs`, MIT `LICENSE`, `.gitignore`, `.env.example`, `README.md`, `vitest.config.ts`.
- Package skeletons: `@bitgetbench/core` (type contract), `guardrail`, `adapters`, `cli`, `skill` (placeholder exports), and `db` (Phase 3 stub). `apps/leaderboard` and `reference-agents` are README placeholders.
- `packages/core/src/types.ts`: the integration contract (Candle, Position, MarketContext, AgentDecision, BenchAgent, GuardRailVerdict, Fill, JournalEntry, Metrics, ReturnDecomposition, LeakCertificate, RunResult, PointInTimeReader). No logic.
- `packages/data`:
  - `timeframe.ts`: timeframe to ms + Bitget granularity mapping, grid alignment.
  - `bitgetFetch.ts`: backward-paging candle fetcher with retry/backoff; all time-sensitive endpoint config isolated in `BITGET_CONFIG`.
  - `cache.ts`: deterministic NDJSON + manifest, merge/dedupe/sort, idempotent writes, sha256.
  - `reader.ts`: `InMemoryPointInTimeReader` (the look-ahead chokepoint), binary-search `countUpTo`, `readerFromCache`. Rejects non-ascending series.
  - `gaps.ts`: gap detection over a series.
  - `dataset.ts`: `fetchAndCacheRange` convenience.
  - `poller.ts`: live poller interface stub (Phase 3).
  - `scripts/fetch-smoke.ts`: the Milestone 0 smoke runner.
- Tests (Vitest + fast-check), 15 passing:
  - `reader.property.test.ts`: property test proving the reader returns exactly the maximal prefix with openTime <= ts, never a future candle; lookback behavior; ascending guard.
  - `cache.test.ts`: merge/dedupe/sort, deterministic NDJSON round-trip, idempotent writes.
  - `bitgetFetch.test.ts`: multi-page assembly, window filtering, row parsing, retry on transient error (all against an in-memory fake endpoint, no network).

### Milestone 0 evidence

- `pnpm typecheck`, `pnpm build`, `pnpm lint` (incl. no-em-dash), `pnpm test` (15/15), `pnpm format:check` all green.
- Live smoke (`pnpm --filter @bitgetbench/data fetch:smoke`):
  - window 2025-12-09T18:15:00Z to 2026-06-07T18:00:00Z, rows 17280, gaps 0, network calls 87, fetch 70.2s.
  - sha256 45e6ccb2a51ce44d8c2e98157a6e8d1bc664cf405721b00187f78f26d344afe6.
  - determinism: round-trip serialize reproduces sha256 PASS, second write idempotent PASS, manifest persisted PASS.
  - point-in-time reader: 500 samples, 0 future-candle leaks, 0 prefix mismatches.

### Next: proposed Phase 1 task list (awaiting sign-off)

1. Portfolio accounting (cash, position, realized/unrealized PnL, equity curve sampled per step; handle long/short flips).
2. Fill simulator: fills at next candle open (no same-bar), USDT-M taker fee + configurable slippage (bps), linear-margin futures model with a liquidation check. Verify the taker fee first.
3. Replay loop: iterate the timeframe grid, build MarketContext via the point-in-time reader only, call agent.decide, simulate fill, update portfolio, sample equity.
4. Basic metrics: totalReturn, CAGR, Sharpe, Sortino, maxDrawdown, Calmar, winRate, profitFactor, expectancy, volatility, trades, exposure.
5. SMA-crossover reference agent (deterministic, no LLM) + buy-and-hold benchmark agent.
6. Milestone 1: buy-and-hold and SMA-crossover backtests produce reproducible equity curves; buy-and-hold reconciles to asset return minus fees.
