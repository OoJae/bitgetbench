// Server-only data access with two modes:
// - VPS (BITGETBENCH_API_BASE unset): open the local SQLite DB the sandbox cron writes.
//   The @bitgetbench/db import is dynamic so node:sqlite never enters a serverless bundle.
// - Vercel (BITGETBENCH_API_BASE set): fetch JSON from the VPS server-side. The VPS stays
//   the single source of truth. A VPS blip yields an empty board, not a crash.

import "server-only";
import type { RunView, TradeRow, Stats, Db } from "@bitgetbench/db";

const apiBase = process.env.BITGETBENCH_API_BASE;

export interface Heartbeat {
  ts: number;
  ok: boolean;
  latencyMs: number;
}

async function apiGet<T>(path: string): Promise<T | null> {
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let cachedDb: Db | null = null;
async function sqliteRepo() {
  const lib = await import("@bitgetbench/db");
  if (!cachedDb) cachedDb = lib.getDb(process.env.BITGETBENCH_DB ?? lib.defaultDbPath());
  return { lib, db: cachedDb };
}

function emptyStats(): Stats {
  return {
    agentsRegistered: 0,
    backtestsRun: 0,
    sandboxCycles: 0,
    simTrades: 0,
    apiCalls: 0,
    distinctUsers: 0,
    leaderboardSize: 0,
  };
}

export async function listRuns(limit = 100): Promise<RunView[]> {
  if (apiBase) return (await apiGet<RunView[]>(`/api/runs?limit=${limit}`)) ?? [];
  const { lib, db } = await sqliteRepo();
  return lib.topRuns(db, limit);
}

export async function runDetail(id: string): Promise<{ run: RunView; trades: TradeRow[] } | null> {
  if (apiBase) return await apiGet(`/api/run/${encodeURIComponent(id)}`);
  const { lib, db } = await sqliteRepo();
  return lib.getRun(db, id);
}

export async function stats(): Promise<Stats> {
  if (apiBase) return (await apiGet<Stats>(`/api/stats`)) ?? emptyStats();
  const { lib, db } = await sqliteRepo();
  return lib.getStats(db);
}

export async function heartbeat(): Promise<Heartbeat | null> {
  if (apiBase) {
    const s = await apiGet<{ sandboxHeartbeat: Heartbeat | null }>(`/api/stats`);
    return s?.sandboxHeartbeat ?? null;
  }
  const { lib, db } = await sqliteRepo();
  const hb = lib.recentHeartbeat(db);
  return hb ? { ts: hb.ts, ok: hb.ok === 1, latencyMs: hb.latencyMs } : null;
}

export type { RunView, TradeRow, Stats };
