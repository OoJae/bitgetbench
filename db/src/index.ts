// @bitgetbench/db: persistence for runs, trades, telemetry, and heartbeats on built-in
// node:sqlite (WAL). Postgres-ready (the DDL is a mechanical port). The leaderboard and CLI
// use the repo helpers, never the database directly.

export { getDb, tx, type Db } from "./client.js";
export { DDL, type RunRow, type TradeRow, type HeartbeatRow } from "./schema.js";
export {
  insertRun,
  recordEvent,
  recordHeartbeat,
  topRuns,
  getRun,
  getStats,
  recentHeartbeat,
  downsample,
  type RunInsert,
  type RunMode,
  type TelemetryType,
  type RunView,
  type EquityPoint,
  type Stats,
} from "./repo.js";
export { getClientId, defaultDbPath } from "./identity.js";
