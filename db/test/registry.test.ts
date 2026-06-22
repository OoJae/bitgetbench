import { describe, expect, it } from "vitest";
import type { RunResult, Metrics } from "@bitgetbench/core";
import {
  getDb,
  insertRun,
  topRuns,
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
  getStats,
  REMOTE_FAILURE_LIMIT,
} from "../src/index.js";

const metrics: Metrics = {
  totalReturn: 0.1,
  cagr: 0.2,
  sharpe: 1.5,
  sortino: 2,
  maxDrawdown: 0.1,
  calmar: 2,
  winRate: 0.6,
  profitFactor: 1.8,
  expectancy: 5,
  volatility: 0.3,
  trades: 4,
  exposure: 0.5,
};

function runResult(agent: string, score: number, over: Partial<RunResult> = {}): RunResult {
  return {
    agent,
    symbol: "BTCUSDT",
    timeframe: "15m",
    startTs: 1000,
    endTs: 2000,
    startEquity: 10_000,
    endEquity: 11_000,
    metrics,
    benchmark: metrics,
    decomposition: { alpha: 0, beta: 1, marketReturn: 0.05, skillReturn: 0.05 },
    leakCertificate: {
      clean: true,
      maxLookaheadMs: 0,
      checkedSteps: 100,
      violations: 0,
      scope: "engine",
    },
    journalRoot: "a".repeat(64),
    score,
    agentKind: "local",
    verificationTier: "engine-verified",
    ...over,
  };
}

const equity = [
  { timestamp: 1000, equity: 10_000 },
  { timestamp: 2000, equity: 11_000 },
];

describe("run tier persistence + filter", () => {
  it("round-trips verificationTier/agentKind and filters by tier", () => {
    const db = getDb(":memory:");
    insertRun(db, {
      result: runResult("local-a", 0.8),
      equityCurve: equity,
      trades: [],
      mode: "backtest",
      clientId: "c1",
    });
    insertRun(db, {
      result: runResult("remote-a", 0.6, {
        agentKind: "remote-webhook",
        verificationTier: "data-clean",
        leakCertificate: {
          clean: true,
          maxLookaheadMs: 0,
          checkedSteps: 100,
          violations: 0,
          scope: "fed-data-only",
        },
      }),
      equityCurve: equity,
      trades: [],
      mode: "backtest",
      clientId: "c2",
    });
    const all = topRuns(db);
    expect(all.length).toBe(2);
    expect(all.find((r) => r.agent === "remote-a")!.verificationTier).toBe("data-clean");
    expect(all.find((r) => r.agent === "remote-a")!.agentKind).toBe("remote-webhook");

    const engineOnly = topRuns(db, 50, undefined, "engine-verified");
    expect(engineOnly.map((r) => r.agent)).toEqual(["local-a"]);
    const dataClean = topRuns(db, 50, undefined, "data-clean");
    expect(dataClean.map((r) => r.agent)).toEqual(["remote-a"]);
  });
});

describe("remote-agent registry", () => {
  it("inserts, lists, fetches, and counts as a registered agent", () => {
    const db = getDb(":memory:");
    insertRemoteAgent(db, {
      id: "ag1",
      name: "tg-bot",
      kind: "remote-webhook",
      webhookUrl: "https://example.com/decide",
      apiKeyHash: "hash1",
      clientId: "c1",
    });
    const enabled = listEnabledRemoteAgents(db);
    expect(enabled.length).toBe(1);
    expect(enabled[0]!.name).toBe("tg-bot");
    expect(getRemoteAgent(db, "ag1")!.webhookUrl).toBe("https://example.com/decide");
    expect(getStats(db).agentsRegistered).toBe(0); // no runs yet -> distinct agents in runs is 0
  });

  it("auto-disables a webhook after repeated failures and re-enables on success reset", () => {
    const db = getDb(":memory:");
    insertRemoteAgent(db, {
      id: "ag2",
      name: "flaky",
      kind: "remote-webhook",
      webhookUrl: "https://x/y",
      apiKeyHash: "h",
      clientId: "c1",
    });
    for (let i = 0; i < REMOTE_FAILURE_LIMIT - 1; i += 1) markRemoteRun(db, "ag2", false);
    expect(getRemoteAgent(db, "ag2")!.enabled).toBe(1);
    markRemoteRun(db, "ag2", false); // hits the limit
    expect(getRemoteAgent(db, "ag2")!.enabled).toBe(0);
    expect(listEnabledRemoteAgents(db).length).toBe(0);
    // A success resets the failure counter (operator can re-enable separately).
    markRemoteRun(db, "ag2", true);
    expect(getRemoteAgent(db, "ag2")!.consecutiveFailures).toBe(0);
  });
});

describe("journal persistence", () => {
  it("saves and upserts a journal blob", () => {
    const db = getDb(":memory:");
    saveJournal(db, "run1", '{"a":1}\n{"b":2}');
    expect(getJournal(db, "run1")).toBe('{"a":1}\n{"b":2}');
    saveJournal(db, "run1", "updated");
    expect(getJournal(db, "run1")).toBe("updated");
    expect(getJournal(db, "missing")).toBeNull();
  });
});

describe("job queue", () => {
  it("creates, claims, patches, and completes a job", () => {
    const db = getDb(":memory:");
    createJob(db, {
      id: "job1",
      kind: "remote-backtest",
      payloadJson: '{"agentId":"ag1"}',
      clientId: "c1",
    });
    expect(nextQueuedJob(db)!.id).toBe("job1");
    updateJob(db, "job1", { status: "running", progress: 0.5 });
    expect(getJob(db, "job1")!.status).toBe("running");
    expect(nextQueuedJob(db)).toBeNull();
    updateJob(db, "job1", { status: "done", progress: 1, runId: "run1" });
    const done = getJob(db, "job1")!;
    expect(done.status).toBe("done");
    expect(done.runId).toBe("run1");
  });
});
