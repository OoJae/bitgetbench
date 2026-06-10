// SQLite via Node's built-in node:sqlite (DatabaseSync), in WAL mode so the sandbox cron
// can write while the leaderboard reads. No native addon to compile. Tables are created
// idempotently from the DDL in schema.ts.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type * as NodeSqlite from "node:sqlite";
import { DDL } from "./schema.js";

// node:sqlite is a very new builtin that some bundlers (Vite/Vitest) do not yet
// auto-externalize. Loading it through createRequire avoids static-import resolution while
// keeping full types via the type-only namespace import above.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof NodeSqlite;

export type Db = NodeSqlite.DatabaseSync;

/** Open (or create) the SQLite database at `path`, in WAL mode, with tables ensured. */
export function getDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(DDL);
  return db;
}

/** Run `fn` inside a transaction, rolling back on error. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
