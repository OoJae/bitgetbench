# BitgetBench Notes

Running development log. Newest entries on top. One section per working turn: what was done, decisions, and a changelog.

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
