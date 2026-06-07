# BitgetBench Notes

Running development log. Newest entries on top. One section per working turn: what was done, decisions, and a changelog.

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
