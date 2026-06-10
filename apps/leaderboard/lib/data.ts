// Server-only data access for the leaderboard. Opens the shared SQLite database (the same
// file the sandbox cron writes) and exposes read helpers. The DB path comes from
// BITGETBENCH_DB; set it when running the app.

import "server-only";
import {
  getDb,
  topRuns,
  getRun,
  getStats,
  recentHeartbeat,
  defaultDbPath,
  type Db,
  type RunView,
  type TradeRow,
  type Stats,
  type HeartbeatRow,
} from "@bitgetbench/db";

let cached: Db | null = null;
function db(): Db {
  if (!cached) cached = getDb(process.env.BITGETBENCH_DB ?? defaultDbPath());
  return cached;
}

export function listRuns(limit = 100): RunView[] {
  return topRuns(db(), limit);
}

export function runDetail(id: string): { run: RunView; trades: TradeRow[] } | null {
  return getRun(db(), id);
}

export function stats(): Stats {
  return getStats(db());
}

export function heartbeat(): HeartbeatRow | null {
  return recentHeartbeat(db());
}

export type { RunView, TradeRow, Stats, HeartbeatRow };
