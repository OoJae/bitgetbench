// Backtest helpers shared by the API routes and the job worker. Both the deterministic
// strategy-spec path and the remote-webhook path run over the same cached BTCUSDT 15m data
// through the same engine, so a remote agent is scored on exactly the same terms as a local one.

import type { EngineConfig, RunResult, BenchAgent } from "@bitgetbench/core";
import { runBenchmarked } from "@bitgetbench/core";
import {
  readerFromCache,
  readManifest,
  DEFAULT_MARKET,
  timeframeToMs,
  type CacheKey,
} from "@bitgetbench/data";
import { specToAgent, specHash, type StrategySpec } from "@bitgetbench/reference-agents";
import { RemoteAgent } from "@bitgetbench/adapters";
import {
  submitRun,
  saveJournal,
  listEnabledRemoteAgents,
  markRemoteRun,
  type Db,
  type RemoteAgentRow,
} from "@bitgetbench/db";

const SYMBOL = "BTCUSDT";
const TIMEFRAME = "15m";
const KEY: CacheKey = { market: DEFAULT_MARKET, symbol: SYMBOL, timeframe: TIMEFRAME };

/** Same engine config the seed and sandbox use, so all runs are comparable. */
const ENGINE_CONFIG: EngineConfig = {
  startEquity: 10_000,
  fees: { takerFee: 0.0006 },
  slippage: { bps: 1 },
  contextLookback: 200,
};

/** Cap remote-webhook backtests to a recent window so a per-step HTTP call stays bounded. */
const REMOTE_BACKTEST_BARS = Number(process.env.BENCH_REMOTE_BACKTEST_BARS ?? 1500);
/** Fail a remote run whose webhook errored on more than this fraction of steps. */
const REMOTE_ERROR_BUDGET = 0.05;
/** Hard wall-clock deadline for an async remote backtest job. */
const REMOTE_BACKTEST_DEADLINE_MS = Number(
  process.env.BENCH_REMOTE_BACKTEST_DEADLINE_MS ?? 300_000,
);

/** Live-sandbox remote pass: bounded window, short timeout, agent cap, total time budget. */
const SANDBOX_REMOTE_BARS = Number(process.env.BENCH_SANDBOX_REMOTE_BARS ?? 200);
const SANDBOX_REMOTE_MAX_AGENTS = Number(process.env.BENCH_SANDBOX_REMOTE_MAX ?? 5);
const SANDBOX_REMOTE_BUDGET_MS = Number(process.env.BENCH_SANDBOX_REMOTE_BUDGET_MS ?? 300_000);
const SANDBOX_REMOTE_TIMEOUT_MS = Number(process.env.BENCH_SANDBOX_REMOTE_TIMEOUT_MS ?? 2500);
/** Per-agent wall-clock deadline inside the sandbox pass (bounds a dead webhook per agent). */
const SANDBOX_REMOTE_PER_AGENT_MS = Number(process.env.BENCH_SANDBOX_REMOTE_PER_AGENT_MS ?? 60_000);

export class NoMarketDataError extends Error {
  constructor() {
    super("no cached market data for BTCUSDT 15m");
    this.name = "NoMarketDataError";
  }
}

function windowFull(): { startTs: number; endTs: number } {
  const manifest = readManifest(KEY);
  if (!manifest || manifest.firstOpenTime === null || manifest.lastOpenTime === null) {
    throw new NoMarketDataError();
  }
  return { startTs: manifest.firstOpenTime, endTs: manifest.lastOpenTime };
}

function windowRecent(bars: number): { startTs: number; endTs: number } {
  const { startTs, endTs } = windowFull();
  const span = bars * timeframeToMs(TIMEFRAME);
  return { startTs: Math.max(startTs, endTs - span), endTs };
}

function journalJsonl(journal: readonly unknown[]): string {
  return journal.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

export interface BacktestResult {
  runId: string;
  result: RunResult;
}

/** Run a deterministic strategy-spec backtest and submit it (engine-verified). */
export async function runSpecBacktest(
  db: Db,
  spec: StrategySpec,
  clientId: string,
): Promise<BacktestResult> {
  const agent: BenchAgent = specToAgent(spec);
  const { startTs, endTs } = windowFull();
  const reader = readerFromCache(KEY);
  const { result, agentRun } = await runBenchmarked({
    agent,
    reader,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startTs,
    endTs,
    config: ENGINE_CONFIG,
    agentKind: "strategy-spec",
  });
  const runId = `spec:${specHash(spec)}`;
  submitRun(db, {
    result,
    equityCurve: agentRun.equityCurve,
    trades: agentRun.trades,
    mode: "backtest",
    label: "external",
    clientId,
    id: runId,
  });
  saveJournal(db, runId, journalJsonl(agentRun.journal));
  return { runId, result };
}

/** Run a remote-webhook backtest over a recent window and submit it (data-clean tier). */
export async function runRemoteBacktest(
  db: Db,
  agentRow: RemoteAgentRow,
  clientId: string,
  runId: string,
): Promise<BacktestResult> {
  if (!agentRow.webhookUrl) throw new Error("remote agent has no webhook url");
  const { startTs, endTs } = windowRecent(REMOTE_BACKTEST_BARS);
  const reader = readerFromCache(KEY);
  const agent = new RemoteAgent({
    name: agentRow.name,
    webhookUrl: agentRow.webhookUrl,
    runId,
    deadlineMs: Date.now() + REMOTE_BACKTEST_DEADLINE_MS,
  });
  const { result, agentRun } = await runBenchmarked({
    agent,
    reader,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startTs,
    endTs,
    config: ENGINE_CONFIG,
    agentKind: "remote-webhook",
  });
  const steps = agentRun.journal.length;
  if (steps > 0 && agent.errorCount / steps > REMOTE_ERROR_BUDGET) {
    throw new Error(
      `webhook errored on ${agent.errorCount}/${steps} steps (over the ${REMOTE_ERROR_BUDGET * 100}% budget)`,
    );
  }
  submitRun(db, {
    result,
    equityCurve: agentRun.equityCurve,
    trades: agentRun.trades,
    mode: "backtest",
    label: "external",
    clientId,
    id: runId,
  });
  saveJournal(db, runId, journalJsonl(agentRun.journal));
  return { runId, result };
}

export interface RemoteSandboxOutcome {
  ran: Array<{ agent: string; runId: string; ok: boolean; reason?: string }>;
}

/**
 * One live-sandbox pass over the registered external agents. Strategy-spec agents run over the
 * full cached window (deterministic, in-process); remote-webhook agents run over a short recent
 * window with a short per-step timeout, so a slow or dead webhook is bounded. Each agent is
 * isolated in its own try/catch and the whole pass respects a total time budget. The caller runs
 * this AFTER recording the cycle heartbeat, so a misbehaving external agent can never affect the
 * reference cycle or the public "live" status. Auto-disables a webhook after repeated failures.
 */
export async function runRemoteSandboxPass(
  db: Db,
  clientId: string,
): Promise<RemoteSandboxOutcome> {
  const ran: RemoteSandboxOutcome["ran"] = [];
  let agents: RemoteAgentRow[];
  try {
    agents = listEnabledRemoteAgents(db).slice(0, SANDBOX_REMOTE_MAX_AGENTS);
  } catch {
    return { ran };
  }
  const deadline = Date.now() + SANDBOX_REMOTE_BUDGET_MS;
  const reader = readerFromCache(KEY);

  for (const row of agents) {
    if (Date.now() > deadline) break;
    const runId = `sandbox:${row.id}`;
    try {
      let agentKind: "strategy-spec" | "remote-webhook";
      let agent;
      let window: { startTs: number; endTs: number };
      let remote: RemoteAgent | null = null;
      if (row.kind === "strategy-spec" && row.specJson) {
        agent = specToAgent(JSON.parse(row.specJson) as StrategySpec);
        agentKind = "strategy-spec";
        window = windowFull();
      } else if (row.kind === "remote-webhook" && row.webhookUrl) {
        remote = new RemoteAgent({
          name: row.name,
          webhookUrl: row.webhookUrl,
          runId,
          timeoutMs: SANDBOX_REMOTE_TIMEOUT_MS,
          retries: 0,
          deadlineMs: Date.now() + SANDBOX_REMOTE_PER_AGENT_MS,
        });
        agent = remote;
        agentKind = "remote-webhook";
        window = windowRecent(SANDBOX_REMOTE_BARS);
      } else {
        continue;
      }
      const { result, agentRun } = await runBenchmarked({
        agent,
        reader,
        symbol: SYMBOL,
        timeframe: TIMEFRAME,
        startTs: window.startTs,
        endTs: window.endTs,
        config: ENGINE_CONFIG,
        agentKind,
      });
      // A persistently dead/slow webhook is a failure, not a flat-equity "success", so it accrues
      // consecutive failures and is auto-disabled (otherwise it would never trip the breaker).
      const steps = agentRun.journal.length;
      if (remote && steps > 0 && remote.errorCount / steps > REMOTE_ERROR_BUDGET) {
        throw new Error(`webhook errored on ${remote.errorCount}/${steps} steps`);
      }
      submitRun(db, {
        result,
        equityCurve: agentRun.equityCurve,
        trades: agentRun.trades,
        mode: "sandbox",
        label: "external",
        clientId,
        id: runId,
      });
      saveJournal(db, runId, journalJsonl(agentRun.journal));
      markRemoteRun(db, row.id, true);
      ran.push({ agent: row.name, runId, ok: true });
    } catch (err) {
      markRemoteRun(db, row.id, false);
      ran.push({ agent: row.name, runId, ok: false, reason: (err as Error).message });
    }
  }
  return { ran };
}
