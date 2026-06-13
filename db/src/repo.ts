// Ingest and query helpers over node:sqlite with raw, parameterized SQL. The leaderboard
// and CLI use these; nothing else touches the database directly. Cumulative counters come
// from telemetry_events (how many times a thing happened); the board comes from runs.

import { randomUUID } from "node:crypto";
import type { RunResult, EquitySample, Trade, Metrics } from "@bitgetbench/core";
import { tx, type Db } from "./client.js";
import type { RunRow, TradeRow, HeartbeatRow } from "./schema.js";

export type TelemetryType =
  | "agent_registered"
  | "backtest_run"
  | "sandbox_cycle"
  | "sim_trade"
  | "api_call"
  | "page_view";

export type RunMode = "backtest" | "sandbox";

export interface RunInsert {
  result: RunResult;
  equityCurve: EquitySample[];
  trades: Trade[];
  mode: RunMode;
  clientId: string;
  label?: "reference" | "external";
  /** Explicit run id. When set, re-inserting upserts (used to keep seeds idempotent). */
  id?: string;
}

export interface EquityPoint {
  t: number;
  e: number;
}

export interface RunView extends Omit<RunRow, "leakClean"> {
  leakClean: boolean;
  equity: EquityPoint[];
  benchmark: Metrics;
}

/** Evenly sample a curve down to at most n points, always keeping the first and last. */
export function downsample(curve: EquitySample[], n: number): EquityPoint[] {
  if (curve.length <= n) return curve.map((s) => ({ t: s.timestamp, e: s.equity }));
  const out: EquityPoint[] = [];
  const step = (curve.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) {
    const idx = Math.min(Math.round(i * step), curve.length - 1);
    const s = curve[idx]!;
    out.push({ t: s.timestamp, e: s.equity });
  }
  return out;
}

function finiteOrNull(x: number): number | null {
  return Number.isFinite(x) ? x : null;
}

function runIdFor(input: RunInsert): string {
  if (input.id) return input.id;
  if (input.mode === "sandbox") {
    const r = input.result;
    return `sandbox:${r.agent}:${r.symbol}:${r.timeframe}`;
  }
  return randomUUID();
}

const RUN_COLUMNS =
  "id, agent, label, symbol, timeframe, market, mode, start_ts, end_ts, start_equity, end_equity, " +
  "total_return, cagr, sharpe, sortino, max_drawdown, calmar, win_rate, profit_factor, expectancy, " +
  "volatility, trades, exposure, benchmark_json, alpha, beta, market_return, skill_return, leak_clean, " +
  "max_lookahead_ms, checked_steps, violations, journal_root, score, equity_json, client_id, created_at";

/** 37 columns -> 37 placeholders. */
const RUN_PLACEHOLDERS = new Array(37).fill("?").join(", ");

/** Insert (or, for sandbox, replace) a run plus its trades. Returns the run id. */
export function insertRun(db: Db, input: RunInsert): string {
  const r = input.result;
  const m = r.metrics;
  const id = runIdFor(input);
  const capped = input.trades.slice(-500);

  return tx(db, () => {
    db.prepare("DELETE FROM trades WHERE run_id = ?").run(id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(id);
    db.prepare(`INSERT INTO runs (${RUN_COLUMNS}) VALUES (${RUN_PLACEHOLDERS})`).run(
      id,
      r.agent,
      input.label ?? "external",
      r.symbol,
      r.timeframe,
      "usdt-futures",
      input.mode,
      r.startTs,
      r.endTs,
      r.startEquity,
      r.endEquity,
      m.totalReturn,
      m.cagr,
      m.sharpe,
      m.sortino,
      m.maxDrawdown,
      m.calmar,
      m.winRate,
      finiteOrNull(m.profitFactor),
      m.expectancy,
      m.volatility,
      m.trades,
      m.exposure,
      JSON.stringify(r.benchmark),
      r.decomposition.alpha,
      r.decomposition.beta,
      r.decomposition.marketReturn,
      r.decomposition.skillReturn,
      r.leakCertificate.clean ? 1 : 0,
      r.leakCertificate.maxLookaheadMs,
      r.leakCertificate.checkedSteps,
      r.leakCertificate.violations,
      r.journalRoot,
      r.score,
      JSON.stringify(downsample(input.equityCurve, 500)),
      input.clientId,
      Date.now(),
    );

    const insertTrade = db.prepare(
      "INSERT INTO trades (run_id, entry_ts, exit_ts, side, entry, exit, qty, pnl_usd, fee_usd, return_pct) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of capped) {
      insertTrade.run(
        id,
        t.entryTs,
        t.exitTs,
        t.side,
        t.entry,
        t.exit,
        t.qty,
        t.pnlUsd,
        t.feeUsd,
        t.returnPct,
      );
    }
    return id;
  });
}

export function recordEvent(db: Db, type: TelemetryType, clientId: string, meta?: unknown): void {
  db.prepare("INSERT INTO telemetry_events (type, client_id, ts, meta) VALUES (?, ?, ?, ?)").run(
    type,
    clientId,
    Date.now(),
    meta === undefined ? null : JSON.stringify(meta),
  );
}

export function recordHeartbeat(db: Db, ok: boolean, latencyMs: number, note?: string): void {
  db.prepare("INSERT INTO heartbeats (ts, ok, latency_ms, note) VALUES (?, ?, ?, ?)").run(
    Date.now(),
    ok ? 1 : 0,
    Math.round(latencyMs),
    note ?? null,
  );
}

const RUN_SELECT =
  "SELECT id, agent, label, symbol, timeframe, market, mode, start_ts AS startTs, end_ts AS endTs, " +
  "start_equity AS startEquity, end_equity AS endEquity, total_return AS totalReturn, cagr, sharpe, " +
  "sortino, max_drawdown AS maxDrawdown, calmar, win_rate AS winRate, profit_factor AS profitFactor, " +
  "expectancy, volatility, trades, exposure, alpha, beta, market_return AS marketReturn, " +
  "skill_return AS skillReturn, leak_clean AS leakClean, max_lookahead_ms AS maxLookaheadMs, " +
  "checked_steps AS checkedSteps, violations, journal_root AS journalRoot, score, " +
  "created_at AS createdAt, client_id AS clientId, equity_json AS equityJson, benchmark_json AS benchmarkJson " +
  "FROM runs";

type RawRunRow = RunRow & { equityJson: string; benchmarkJson: string };

function toView(row: RawRunRow): RunView {
  const { equityJson, benchmarkJson, leakClean, ...rest } = row;
  return {
    ...rest,
    leakClean: leakClean === 1,
    equity: JSON.parse(equityJson) as EquityPoint[],
    benchmark: JSON.parse(benchmarkJson) as Metrics,
  };
}

/** Top runs by composite score (descending). Optionally filter by mode. */
export function topRuns(db: Db, limit = 50, mode?: RunMode): RunView[] {
  const rows = mode
    ? (db
        .prepare(`${RUN_SELECT} WHERE mode = ? ORDER BY score DESC LIMIT ?`)
        .all(mode, limit) as unknown as RawRunRow[])
    : (db
        .prepare(`${RUN_SELECT} ORDER BY score DESC LIMIT ?`)
        .all(limit) as unknown as RawRunRow[]);
  return rows.map(toView);
}

export function getRun(db: Db, id: string): { run: RunView; trades: TradeRow[] } | null {
  const row = db.prepare(`${RUN_SELECT} WHERE id = ?`).get(id) as unknown as RawRunRow | undefined;
  if (!row) return null;
  const trades = db
    .prepare(
      "SELECT id, run_id AS runId, entry_ts AS entryTs, exit_ts AS exitTs, side, entry, exit, qty, " +
        "pnl_usd AS pnlUsd, fee_usd AS feeUsd, return_pct AS returnPct FROM trades WHERE run_id = ? ORDER BY entry_ts",
    )
    .all(id) as unknown as TradeRow[];
  return { run: toView(row), trades };
}

export interface Stats {
  agentsRegistered: number;
  backtestsRun: number;
  sandboxCycles: number;
  simTrades: number;
  apiCalls: number;
  distinctUsers: number;
  leaderboardSize: number;
}

function scalar(db: Db, sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params) as unknown as { n: number } | undefined;
  return row?.n ?? 0;
}

export function getStats(db: Db): Stats {
  const ev = (type: TelemetryType): number =>
    scalar(db, "SELECT count(*) AS n FROM telemetry_events WHERE type = ?", type);
  return {
    agentsRegistered: scalar(db, "SELECT count(DISTINCT agent) AS n FROM runs"),
    backtestsRun: ev("backtest_run"),
    sandboxCycles: ev("sandbox_cycle"),
    // Total sim trades logged across the live sandbox runs.
    simTrades: scalar(db, "SELECT coalesce(sum(trades), 0) AS n FROM runs WHERE mode = 'sandbox'"),
    apiCalls: ev("api_call"),
    distinctUsers: scalar(db, "SELECT count(DISTINCT client_id) AS n FROM telemetry_events"),
    leaderboardSize: scalar(db, "SELECT count(*) AS n FROM runs"),
  };
}

export function recentHeartbeat(db: Db): HeartbeatRow | null {
  return (
    (db
      .prepare(
        "SELECT id, ts, ok, latency_ms AS latencyMs, note FROM heartbeats ORDER BY ts DESC LIMIT 1",
      )
      .get() as unknown as HeartbeatRow | undefined) ?? null
  );
}
