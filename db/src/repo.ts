// Ingest and query helpers over node:sqlite with raw, parameterized SQL. The leaderboard
// and CLI use these; nothing else touches the database directly. Cumulative counters come
// from telemetry_events (how many times a thing happened); the board comes from runs.

import { randomUUID } from "node:crypto";
import type { RunResult, EquitySample, Trade, Metrics } from "@bitgetbench/core";
import { tx, type Db } from "./client.js";
import type { RunRow, TradeRow, HeartbeatRow, RemoteAgentRow, JobRow } from "./schema.js";

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
  "max_lookahead_ms, checked_steps, violations, journal_root, score, equity_json, client_id, created_at, " +
  "verification_tier, agent_kind";

/** 39 columns -> 39 placeholders. */
const RUN_PLACEHOLDERS = new Array(39).fill("?").join(", ");

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
      r.verificationTier,
      r.agentKind,
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

/**
 * Persist a benchmarked run and record its telemetry, on an open Db handle. The single
 * write path shared by the CLI, the live sandbox, and the public API. Backtests count once
 * per run; sandbox cycles are counted once per cycle by the caller. Returns the run id.
 */
export function submitRun(db: Db, input: RunInsert): string {
  const runId = insertRun(db, input);
  if (input.mode === "backtest") {
    recordEvent(db, "backtest_run", input.clientId, { agent: input.result.agent });
  }
  return runId;
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
  "created_at AS createdAt, client_id AS clientId, verification_tier AS verificationTier, " +
  "agent_kind AS agentKind, equity_json AS equityJson, benchmark_json AS benchmarkJson " +
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

/** Top runs by composite score (descending). Optionally filter by mode and/or tier. */
export function topRuns(
  db: Db,
  limit = 50,
  mode?: RunMode,
  tier?: "engine-verified" | "data-clean" | "disqualified",
): RunView[] {
  const where: string[] = [];
  const args: Array<string | number> = [];
  if (mode) {
    where.push("mode = ?");
    args.push(mode);
  }
  if (tier) {
    where.push("verification_tier = ?");
    args.push(tier);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  args.push(limit);
  const rows = db
    .prepare(`${RUN_SELECT}${clause} ORDER BY score DESC LIMIT ?`)
    .all(...args) as unknown as RawRunRow[];
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
    // One heartbeat is written per sandbox cycle, so this is the accurate cycle count
    // (the sandbox_cycle event stream was inflated by an earlier per-agent double-count).
    sandboxCycles: scalar(db, "SELECT count(*) AS n FROM heartbeats"),
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

// --- Remote-agent registry --------------------------------------------------

/** Auto-disable a remote agent after this many consecutive failed sandbox runs. */
export const REMOTE_FAILURE_LIMIT = 5;

export interface RemoteAgentInsert {
  id: string;
  name: string;
  kind: "remote-webhook" | "strategy-spec";
  webhookUrl?: string | null;
  specJson?: string | null;
  apiKeyHash: string;
  clientId: string;
}

const REMOTE_SELECT =
  "SELECT id, name, kind, webhook_url AS webhookUrl, spec_json AS specJson, " +
  "api_key_hash AS apiKeyHash, client_id AS clientId, enabled, " +
  "consecutive_failures AS consecutiveFailures, last_run_ts AS lastRunTs, created_at AS createdAt " +
  "FROM remote_agents";

/** Register an externally-hosted agent. Records an agent_registered telemetry event. */
export function insertRemoteAgent(db: Db, input: RemoteAgentInsert): string {
  return tx(db, () => {
    db.prepare(
      "INSERT INTO remote_agents (id, name, kind, webhook_url, spec_json, api_key_hash, client_id, " +
        "enabled, consecutive_failures, last_run_ts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?)",
    ).run(
      input.id,
      input.name,
      input.kind,
      input.webhookUrl ?? null,
      input.specJson ?? null,
      input.apiKeyHash,
      input.clientId,
      Date.now(),
    );
    recordEvent(db, "agent_registered", input.clientId, { agent: input.name, kind: input.kind });
    return input.id;
  });
}

export function listEnabledRemoteAgents(db: Db): RemoteAgentRow[] {
  return db
    .prepare(`${REMOTE_SELECT} WHERE enabled = 1 ORDER BY created_at`)
    .all() as unknown as RemoteAgentRow[];
}

export function getRemoteAgent(db: Db, id: string): RemoteAgentRow | null {
  return (
    (db.prepare(`${REMOTE_SELECT} WHERE id = ?`).get(id) as unknown as
      | RemoteAgentRow
      | undefined) ?? null
  );
}

/** Record the outcome of a remote agent's run; auto-disable after repeated failures. */
export function markRemoteRun(db: Db, id: string, ok: boolean): void {
  if (ok) {
    db.prepare(
      "UPDATE remote_agents SET consecutive_failures = 0, last_run_ts = ? WHERE id = ?",
    ).run(Date.now(), id);
    return;
  }
  db.prepare(
    "UPDATE remote_agents SET consecutive_failures = consecutive_failures + 1, " +
      "enabled = CASE WHEN consecutive_failures + 1 >= ? THEN 0 ELSE enabled END WHERE id = ?",
  ).run(REMOTE_FAILURE_LIMIT, id);
}

// --- Journal persistence (full decision trail for remote runs) --------------

export function saveJournal(db: Db, runId: string, jsonl: string): void {
  db.prepare(
    "INSERT INTO journals (run_id, jsonl, created_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(run_id) DO UPDATE SET jsonl = excluded.jsonl, created_at = excluded.created_at",
  ).run(runId, jsonl, Date.now());
}

export function getJournal(db: Db, runId: string): string | null {
  const row = db.prepare("SELECT jsonl FROM journals WHERE run_id = ?").get(runId) as
    | { jsonl: string }
    | undefined;
  return row?.jsonl ?? null;
}

// --- Async job queue (remote-webhook backtests are slow) --------------------

export interface JobCreate {
  id: string;
  kind: string;
  payloadJson: string;
  clientId: string;
}

export function createJob(db: Db, input: JobCreate): string {
  const now = Date.now();
  db.prepare(
    "INSERT INTO jobs (id, status, progress, kind, payload_json, run_id, error, client_id, created_at, updated_at) " +
      "VALUES (?, 'queued', 0, ?, ?, NULL, NULL, ?, ?, ?)",
  ).run(input.id, input.kind, input.payloadJson, input.clientId, now, now);
  return input.id;
}

export interface JobPatch {
  status?: string;
  progress?: number;
  runId?: string | null;
  error?: string | null;
}

export function updateJob(db: Db, id: string, patch: JobPatch): void {
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push("progress = ?");
    args.push(patch.progress);
  }
  if (patch.runId !== undefined) {
    sets.push("run_id = ?");
    args.push(patch.runId);
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    args.push(patch.error);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  args.push(Date.now());
  args.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...args);
}

const JOB_SELECT =
  "SELECT id, status, progress, kind, payload_json AS payloadJson, run_id AS runId, error, " +
  "client_id AS clientId, created_at AS createdAt, updated_at AS updatedAt FROM jobs";

export function getJob(db: Db, id: string): JobRow | null {
  return (
    (db.prepare(`${JOB_SELECT} WHERE id = ?`).get(id) as unknown as JobRow | undefined) ?? null
  );
}

/** Oldest queued job, for a worker to claim. */
export function nextQueuedJob(db: Db): JobRow | null {
  return (
    (db
      .prepare(`${JOB_SELECT} WHERE status = 'queued' ORDER BY created_at LIMIT 1`)
      .get() as unknown as JobRow | undefined) ?? null
  );
}
