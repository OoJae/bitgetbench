// bitgetbench CLI command implementations. Kept separate from the commander wiring (bin.ts)
// so they are unit-testable. JSON output matches the bgc convention.

import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { BenchAgent, EngineConfig, RunResult, BacktestRun } from "@bitgetbench/core";
import { runBenchmarked, verifyJournal, type JournalEntry } from "@bitgetbench/core";
import { readerFromCache, readManifest, DEFAULT_MARKET, type CacheKey } from "@bitgetbench/data";
import {
  getDb,
  insertRun,
  recordEvent,
  getStats,
  getClientId,
  defaultDbPath,
  type RunMode,
  type Stats,
} from "@bitgetbench/db";
import {
  BuyAndHoldAgent,
  SmaCrossoverAgent,
  SkillMomentumAgent,
} from "@bitgetbench/reference-agents";
import { AGENT_TEMPLATE, CONFIG_TEMPLATE, README_SNIPPET } from "./templates.js";

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  market: string;
  startEquity: number;
  fees: { takerFee: number };
  slippage: { bps: number };
  contextLookback?: number;
  /** Path to the agent module, relative to the config file. */
  agent: string;
  /** Optional explicit window; defaults to the full cached range. */
  startTs?: number;
  endTs?: number;
  /** Optional cache directory override; defaults to the repo data-cache. */
  cacheDir?: string;
}

/** Scaffold an agent + config + readme into `dir`. Returns the files written. */
export function initScaffold(dir: string, force = false): string[] {
  mkdirSync(dir, { recursive: true });
  const files: Array<[string, string]> = [
    ["bitgetbench.agent.mjs", AGENT_TEMPLATE],
    ["bitgetbench.config.json", CONFIG_TEMPLATE],
    ["BITGETBENCH.md", README_SNIPPET],
  ];
  const written: string[] = [];
  for (const [name, content] of files) {
    const path = join(dir, name);
    if (existsSync(path) && !force) continue;
    writeFileSync(path, content, "utf8");
    written.push(path);
  }
  return written;
}

async function loadAgent(modulePath: string): Promise<BenchAgent> {
  const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  let candidate: unknown = mod.default ?? mod.agent;
  if (typeof candidate === "function") candidate = (candidate as () => unknown)();
  const agent = candidate as BenchAgent | undefined;
  if (!agent || typeof agent.decide !== "function" || typeof agent.name !== "string") {
    throw new Error(
      `Agent module ${modulePath} must export a BenchAgent (default or "agent") with name + decide`,
    );
  }
  return agent;
}

export interface BacktestOutcome {
  result: RunResult;
  journalPath?: string;
  runId?: string;
}

/** Persist a benchmarked run and record telemetry. Returns the run id. */
export function submitRun(
  dbPath: string,
  result: RunResult,
  agentRun: BacktestRun,
  mode: RunMode,
  label: "reference" | "external",
  clientId: string,
): string {
  const db = getDb(dbPath);
  const id = insertRun(db, {
    result,
    equityCurve: agentRun.equityCurve,
    trades: agentRun.trades,
    mode,
    clientId,
    label,
  });
  recordEvent(db, mode === "sandbox" ? "sandbox_cycle" : "backtest_run", clientId, {
    agent: result.agent,
  });
  return id;
}

/** Run a leak-audited, benchmarked backtest from a config file. */
export async function runBacktestCommand(
  configPath: string,
  opts: { journalOut?: string; submit?: boolean; dbPath?: string } = {},
): Promise<BacktestOutcome> {
  const absConfig = resolve(configPath);
  const config = JSON.parse(readFileSync(absConfig, "utf8")) as BacktestConfig;
  const configDir = dirname(absConfig);

  const agentPath = isAbsolute(config.agent) ? config.agent : resolve(configDir, config.agent);
  const agent = await loadAgent(agentPath);

  const key: CacheKey = {
    market: config.market,
    symbol: config.symbol,
    timeframe: config.timeframe,
  };
  const manifest = config.cacheDir ? readManifest(key, config.cacheDir) : readManifest(key);
  if (!manifest || manifest.firstOpenTime === null || manifest.lastOpenTime === null) {
    throw new Error(
      `No cached candles for ${config.market}/${config.symbol}/${config.timeframe}. Fetch them first.`,
    );
  }
  const reader = config.cacheDir ? readerFromCache(key, config.cacheDir) : readerFromCache(key);
  const startTs = config.startTs ?? manifest.firstOpenTime;
  const endTs = config.endTs ?? manifest.lastOpenTime;

  const engineConfig: EngineConfig = {
    startEquity: config.startEquity,
    fees: config.fees,
    slippage: config.slippage,
    ...(config.contextLookback !== undefined ? { contextLookback: config.contextLookback } : {}),
  };

  const { result, agentRun } = await runBenchmarked({
    agent,
    reader,
    symbol: config.symbol,
    timeframe: config.timeframe,
    startTs,
    endTs,
    config: engineConfig,
  });

  const outcome: BacktestOutcome = { result };
  if (opts.journalOut) {
    const jsonl = agentRun.journal.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(resolve(opts.journalOut), jsonl, "utf8");
    outcome.journalPath = resolve(opts.journalOut);
  }
  if (opts.submit) {
    const dbPath = opts.dbPath ?? defaultDbPath();
    outcome.runId = submitRun(dbPath, result, agentRun, "backtest", "external", getClientId());
  }
  return outcome;
}

/** Print telemetry counters from the database. */
export function statsCommand(dbPath?: string): Stats {
  const db = getDb(dbPath ?? defaultDbPath());
  recordEvent(db, "api_call", getClientId(), { cmd: "stats" });
  return getStats(db);
}

export interface SeedOutcome {
  seeded: Array<{ agent: string; runId: string; score: number }>;
}

/** Run the three reference agents over the cached BTCUSDT 15m data and submit them. */
export async function seedCommand(dbPath?: string): Promise<SeedOutcome> {
  const key: CacheKey = { market: DEFAULT_MARKET, symbol: "BTCUSDT", timeframe: "15m" };
  const manifest = readManifest(key);
  if (!manifest || manifest.firstOpenTime === null || manifest.lastOpenTime === null) {
    throw new Error("No cached candles for BTCUSDT 15m. Fetch them first.");
  }
  const reader = readerFromCache(key);
  const path = dbPath ?? defaultDbPath();
  const clientId = getClientId();
  const common = {
    reader,
    symbol: "BTCUSDT",
    timeframe: "15m",
    startTs: manifest.firstOpenTime,
    endTs: manifest.lastOpenTime,
  };
  const config: EngineConfig = {
    startEquity: 10_000,
    fees: { takerFee: 0.0006 },
    slippage: { bps: 1 },
    contextLookback: 200,
  };

  const agents: BenchAgent[] = [
    new BuyAndHoldAgent(),
    new SmaCrossoverAgent({ fast: 20, slow: 50 }),
    new SkillMomentumAgent(),
  ];
  const seeded: SeedOutcome["seeded"] = [];
  for (const agent of agents) {
    const { result, agentRun } = await runBenchmarked({ ...common, agent, config });
    const runId = submitRun(path, result, agentRun, "backtest", "reference", clientId);
    seeded.push({ agent: result.agent, runId, score: result.score });
  }
  return { seeded };
}

export interface VerifyOutcome {
  ok: boolean;
  brokenAt: number | null;
  checked: number;
}

/** Verify a journal JSONL file's hash chain. */
export function verifyCommand(journalPath: string): VerifyOutcome {
  const text = readFileSync(resolve(journalPath), "utf8");
  const entries: JournalEntry[] = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as JournalEntry);
  return verifyJournal(entries);
}
