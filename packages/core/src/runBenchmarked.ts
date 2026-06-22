// Orchestrates a full benchmarked run: the agent plus a buy-and-hold benchmark through the
// same engine, then return decomposition, leak certificate, journal root, and composite
// score assembled into a RunResult. The benchmark agent is internal so core stays free of
// any dependency on the reference-agents package.

import type { BenchAgent, MarketContext, AgentDecision, RunResult, BacktestRun } from "./types.js";
import { runBacktest, type RunBacktestParams } from "./engine.js";
import { decomposeReturns } from "./decomposition.js";
import { compositeScore, deriveVerificationTier } from "./score.js";

/** Internal buy-and-hold used as the benchmark baseline. Mirrors the reference agent. */
class BenchmarkBuyAndHold implements BenchAgent {
  readonly name = "buy-and-hold";
  async decide(ctx: MarketContext): Promise<AgentDecision> {
    if (ctx.position === null) {
      return {
        action: "long",
        symbol: ctx.symbol,
        sizePct: 1,
        leverage: 1,
        rationale: "benchmark",
      };
    }
    return { action: "hold", symbol: ctx.symbol, sizePct: 0, rationale: "benchmark" };
  }
}

export interface BenchmarkedResult {
  result: RunResult;
  agentRun: BacktestRun;
  benchmarkRun: BacktestRun;
}

export async function runBenchmarked(
  params: RunBacktestParams,
  opts?: { benchmark?: BenchAgent },
): Promise<BenchmarkedResult> {
  const agentRun = await runBacktest(params);
  const benchmark = opts?.benchmark ?? new BenchmarkBuyAndHold();
  // The benchmark is always our internal in-process buy-and-hold, so force agentKind local.
  const benchmarkRun = await runBacktest({ ...params, agent: benchmark, agentKind: "local" });

  const decomposition = decomposeReturns(
    agentRun.equityCurve,
    benchmarkRun.equityCurve,
    agentRun.metrics.totalReturn,
    benchmarkRun.metrics.totalReturn,
  );
  const score = compositeScore(agentRun.metrics, agentRun.leakCertificate);
  const agentKind = params.agentKind ?? "local";

  const result: RunResult = {
    agent: agentRun.agent,
    symbol: agentRun.symbol,
    timeframe: agentRun.timeframe,
    startTs: agentRun.startTs,
    endTs: agentRun.endTs,
    startEquity: agentRun.startEquity,
    endEquity: agentRun.endEquity,
    metrics: agentRun.metrics,
    benchmark: benchmarkRun.metrics,
    decomposition,
    leakCertificate: agentRun.leakCertificate,
    journalRoot: agentRun.journalRoot,
    score,
    agentKind,
    verificationTier: deriveVerificationTier(agentRun.leakCertificate, agentKind),
  };

  return { result, agentRun, benchmarkRun };
}
