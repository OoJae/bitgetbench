// bitgetbench CLI command implementations. Kept separate from the commander wiring (bin.ts)
// so they are unit-testable. JSON output matches the bgc convention.

import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { BenchAgent, EngineConfig, RunResult } from "@bitgetbench/core";
import { runBenchmarked, verifyJournal, type JournalEntry } from "@bitgetbench/core";
import { readerFromCache, readManifest, type CacheKey } from "@bitgetbench/data";
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
}

/** Run a leak-audited, benchmarked backtest from a config file. */
export async function runBacktestCommand(
  configPath: string,
  opts: { journalOut?: string } = {},
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
  return outcome;
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
