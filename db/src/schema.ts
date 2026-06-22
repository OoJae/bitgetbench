// Row types and the table DDL. We use the built-in node:sqlite (DatabaseSync) with raw SQL
// rather than an ORM with a native addon, because native modules (better-sqlite3) do not yet
// build against the bleeding-edge Node here. The table shapes are unchanged and a Postgres
// port is a mechanical swap of the DDL types.

/** A run row, with camelCase fields (SELECTs alias the snake_case columns). */
export interface RunRow {
  id: string;
  agent: string;
  label: string;
  symbol: string;
  timeframe: string;
  market: string;
  mode: string;
  startTs: number;
  endTs: number;
  startEquity: number;
  endEquity: number;
  totalReturn: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  volatility: number;
  trades: number;
  exposure: number;
  alpha: number;
  beta: number;
  marketReturn: number;
  skillReturn: number;
  leakClean: number; // 0 or 1 in the DB
  maxLookaheadMs: number;
  checkedSteps: number;
  violations: number;
  journalRoot: string;
  score: number;
  createdAt: number;
  clientId: string;
  /** Honest provenance label: engine-verified | data-clean | disqualified. */
  verificationTier: string;
  /** What the agent is: local | strategy-spec | remote-webhook. */
  agentKind: string;
}

export interface TradeRow {
  id: number;
  runId: string;
  entryTs: number;
  exitTs: number;
  side: string;
  entry: number;
  exit: number;
  qty: number;
  pnlUsd: number;
  feeUsd: number;
  returnPct: number;
}

export interface HeartbeatRow {
  id: number;
  ts: number;
  ok: number;
  latencyMs: number;
  note: string | null;
}

/** A registered externally-hosted agent (a remote webhook, or a stored strategy spec). */
export interface RemoteAgentRow {
  id: string;
  name: string;
  /** 'remote-webhook' | 'strategy-spec'. */
  kind: string;
  webhookUrl: string | null;
  specJson: string | null;
  apiKeyHash: string;
  clientId: string;
  enabled: number; // 0 or 1
  consecutiveFailures: number;
  lastRunTs: number | null;
  createdAt: number;
}

/** An async backtest job (used for remote-webhook runs, which are slow). */
export interface JobRow {
  id: string;
  /** 'queued' | 'running' | 'done' | 'failed'. */
  status: string;
  /** 0..1 fraction of steps completed. */
  progress: number;
  kind: string;
  payloadJson: string;
  runId: string | null;
  error: string | null;
  clientId: string;
  createdAt: number;
  updatedAt: number;
}

export const DDL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'external',
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  market TEXT NOT NULL,
  mode TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  start_equity REAL NOT NULL,
  end_equity REAL NOT NULL,
  total_return REAL NOT NULL,
  cagr REAL NOT NULL,
  sharpe REAL NOT NULL,
  sortino REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  calmar REAL NOT NULL,
  win_rate REAL NOT NULL,
  profit_factor REAL,
  expectancy REAL NOT NULL,
  volatility REAL NOT NULL,
  trades INTEGER NOT NULL,
  exposure REAL NOT NULL,
  benchmark_json TEXT NOT NULL,
  alpha REAL NOT NULL,
  beta REAL NOT NULL,
  market_return REAL NOT NULL,
  skill_return REAL NOT NULL,
  leak_clean INTEGER NOT NULL,
  max_lookahead_ms INTEGER NOT NULL,
  checked_steps INTEGER NOT NULL,
  violations INTEGER NOT NULL,
  journal_root TEXT NOT NULL,
  score REAL NOT NULL,
  equity_json TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verification_tier TEXT NOT NULL DEFAULT 'engine-verified',
  agent_kind TEXT NOT NULL DEFAULT 'local'
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  entry_ts INTEGER NOT NULL,
  exit_ts INTEGER NOT NULL,
  side TEXT NOT NULL,
  entry REAL NOT NULL,
  exit REAL NOT NULL,
  qty REAL NOT NULL,
  pnl_usd REAL NOT NULL,
  fee_usd REAL NOT NULL,
  return_pct REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  client_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  meta TEXT
);
CREATE TABLE IF NOT EXISTS heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS remote_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  webhook_url TEXT,
  spec_json TEXT,
  api_key_hash TEXT NOT NULL,
  client_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_run_ts INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS journals (
  run_id TEXT PRIMARY KEY,
  jsonl TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  run_id TEXT,
  error TEXT,
  client_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_run ON trades(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs(mode);
CREATE INDEX IF NOT EXISTS idx_events_type ON telemetry_events(type);
CREATE INDEX IF NOT EXISTS idx_remote_enabled ON remote_agents(enabled);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`;

/**
 * Idempotent column additions for databases created before these columns existed.
 * CREATE TABLE IF NOT EXISTS does not alter an existing table, so the live VPS DB needs
 * these run explicitly. Each is a constant-default NOT NULL, which SQLite allows in ALTER.
 */
export const RUN_COLUMN_MIGRATIONS: Array<{ column: string; ddl: string }> = [
  { column: "verification_tier", ddl: "verification_tier TEXT NOT NULL DEFAULT 'engine-verified'" },
  { column: "agent_kind", ddl: "agent_kind TEXT NOT NULL DEFAULT 'local'" },
];
