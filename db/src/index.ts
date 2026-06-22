// @bitgetbench/db: persistence for runs, trades, telemetry, and heartbeats on built-in
// node:sqlite (WAL). Postgres-ready (the DDL is a mechanical port). The leaderboard and CLI
// use the repo helpers, never the database directly.

export { getDb, tx, type Db } from "./client.js";
export {
  DDL,
  type RunRow,
  type TradeRow,
  type HeartbeatRow,
  type RemoteAgentRow,
  type JobRow,
} from "./schema.js";
export {
  insertRun,
  submitRun,
  recordEvent,
  recordHeartbeat,
  topRuns,
  getRun,
  getStats,
  recentHeartbeat,
  downsample,
  insertRemoteAgent,
  listEnabledRemoteAgents,
  getRemoteAgent,
  markRemoteRun,
  saveJournal,
  getJournal,
  createJob,
  updateJob,
  getJob,
  nextQueuedJob,
  REMOTE_FAILURE_LIMIT,
  type RunInsert,
  type RunMode,
  type TelemetryType,
  type RunView,
  type EquityPoint,
  type Stats,
  type RemoteAgentInsert,
  type JobCreate,
  type JobPatch,
} from "./repo.js";
export { getClientId, defaultDbPath } from "./identity.js";
