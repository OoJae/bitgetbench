// The backtest replay loop. It reads candles ONLY through the point-in-time reader, and
// every order fills at the NEXT bar open, so the agent never sees the bar it trades into
// (hard rule 4). Deterministic: no randomness, same inputs give the same equity curve.

import type {
  BenchAgent,
  PointInTimeReader,
  MarketContext,
  Position,
  EngineConfig,
  BacktestRun,
  EquitySample,
  GuardRailVerdict,
  GuardRail,
  AgentKind,
  AgentResponseMeta,
} from "./types.js";
import { Portfolio } from "./portfolio.js";
import { computeMetrics } from "./metrics.js";
import { LeakAuditor } from "./leakAudit.js";
import { Journal, sha256Hex, stableStringify } from "./journal.js";

export interface RunBacktestParams {
  agent: BenchAgent;
  reader: PointInTimeReader;
  symbol: string;
  timeframe: string;
  /** Inclusive window start (epoch ms). */
  startTs: number;
  /** Inclusive window end (epoch ms). */
  endTs: number;
  config: EngineConfig;
  /** Optional risk middleware applied between the decision and the fill. */
  guardrail?: GuardRail;
  /** What the agent is. Drives the leak-certificate scope. Defaults to `local`. */
  agentKind?: AgentKind;
}

/**
 * An agent that can report per-step forensic metadata (a remote webhook's raw response).
 * Duck-typed so core stays decoupled from @bitgetbench/adapters; RemoteAgent implements it.
 */
export interface ResponseReportingAgent {
  consumeLastResponse(): AgentResponseMeta | undefined;
}

function hasResponseReporting(agent: BenchAgent): agent is BenchAgent & ResponseReportingAgent {
  return typeof (agent as Partial<ResponseReportingAgent>).consumeLastResponse === "function";
}

/**
 * A compact, stable fingerprint of the context the agent saw, hashed into the journal so the
 * recorded decision is cryptographically bound to its context. It commits to the decision
 * time, the candle window bounds and last close, and the position/equity; the candle window
 * itself is reproducible from the point-in-time reader given these parameters. Compact by
 * design so hashing is O(1) per step rather than O(window) over a growing history.
 */
export function contextHashOf(ctx: MarketContext): string {
  const first = ctx.candles[0];
  const last = ctx.candles[ctx.candles.length - 1];
  return sha256Hex(
    stableStringify({
      timestamp: ctx.timestamp,
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      n: ctx.candles.length,
      firstOpenTime: first ? first.openTime : null,
      lastOpenTime: last ? last.openTime : null,
      lastClose: last ? last.close : null,
      position: ctx.position,
      equity: ctx.equity,
    }),
  );
}

function toPublicPosition(p: Portfolio): Position | null {
  const pos = p.position;
  if (!pos) return null;
  return {
    side: pos.side,
    sizeUsd: pos.qty * pos.entry,
    entry: pos.entry,
    leverage: pos.leverage,
  };
}

export async function runBacktest(params: RunBacktestParams): Promise<BacktestRun> {
  const { agent, reader, symbol, timeframe, startTs, endTs, config } = params;

  // The full series up to endTs, then the window we iterate. Reading via the reader keeps
  // grid enumeration and fill lookup on the same leak-safe path the agent uses.
  const all = reader.getCandlesUpTo(symbol, timeframe, endTs);
  const bars = all.filter((c) => c.openTime >= startTs && c.openTime <= endTs);
  if (bars.length < 2) {
    throw new Error(
      `runBacktest needs at least 2 candles in [${startTs}, ${endTs}], got ${bars.length}`,
    );
  }
  const stepMs = bars[1]!.openTime - bars[0]!.openTime;

  const portfolio = new Portfolio(config.startEquity, config.fees, config.slippage);
  const equityCurve: EquitySample[] = [
    { timestamp: bars[0]!.openTime, equity: config.startEquity },
  ];
  const auditor = new LeakAuditor();
  const journal = new Journal();
  let barsWithPosition = 0;

  for (let i = 0; i < bars.length - 1; i += 1) {
    const bar = bars[i]!;
    const fillBar = bars[i + 1]!;
    const decisionTs = bar.openTime;

    const candles =
      config.contextLookback !== undefined
        ? reader.getCandlesUpTo(symbol, timeframe, decisionTs, { lookback: config.contextLookback })
        : reader.getCandlesUpTo(symbol, timeframe, decisionTs);

    const ctx: MarketContext = {
      timestamp: decisionTs,
      symbol,
      timeframe,
      candles,
      position: toPublicPosition(portfolio),
      equity: portfolio.equity(bar.close),
    };

    // Update guardrail state with the equity entering this step, then decide and screen.
    params.guardrail?.onStep(portfolio.equity(bar.close), decisionTs);
    const decision = await agent.decide(ctx);
    const agentResponse = hasResponseReporting(agent) ? agent.consumeLastResponse() : undefined;
    const verdict: GuardRailVerdict = params.guardrail
      ? params.guardrail.apply(decision)
      : { allowed: decision, blocked: false, reasons: [] };
    const allowed = verdict.allowed;
    const leverage = allowed.leverage ?? 1;
    const fillTs = fillBar.openTime;
    const ref = fillBar.open;

    portfolio.resetFill();
    switch (allowed.action) {
      case "long":
        if (!portfolio.hasPosition()) {
          portfolio.openPosition("long", ref, allowed.sizePct, leverage, fillTs);
        } else if (portfolio.position!.side === "short") {
          portfolio.closePosition(ref, fillTs);
          portfolio.openPosition("long", ref, allowed.sizePct, leverage, fillTs);
        }
        break;
      case "short":
        if (!portfolio.hasPosition()) {
          portfolio.openPosition("short", ref, allowed.sizePct, leverage, fillTs);
        } else if (portfolio.position!.side === "long") {
          portfolio.closePosition(ref, fillTs);
          portfolio.openPosition("short", ref, allowed.sizePct, leverage, fillTs);
        }
        break;
      case "close":
        portfolio.closePosition(ref, fillTs);
        break;
      case "hold":
        break;
    }

    // Conservative liquidation: if the position is underwater past its margin at the bar
    // close, force-close it there. Never triggers for leverage-1 buy-and-hold.
    if (portfolio.hasPosition() && portfolio.equity(fillBar.close) <= 0) {
      portfolio.closePosition(fillBar.close, fillTs);
    }

    const equityAfter = portfolio.equity(fillBar.close);
    auditor.record(candles, decisionTs, fillBar.openTime);
    journal.append(
      decisionTs,
      contextHashOf(ctx),
      decision,
      verdict,
      portfolio.lastFill,
      equityAfter,
      agentResponse,
    );

    if (portfolio.hasPosition()) barsWithPosition += 1;
    equityCurve.push({ timestamp: fillBar.openTime, equity: equityAfter });
  }

  // Settle any open position into the trade log (no cash change) so metrics are defined.
  const lastBar = bars[bars.length - 1]!;
  portfolio.settleOpenPosition(lastBar.close, lastBar.openTime);

  const exposure = barsWithPosition / (bars.length - 1);
  const metrics = computeMetrics(equityCurve, portfolio.trades, { stepMs, exposure });
  const endEquity = equityCurve[equityCurve.length - 1]!.equity;
  // Allowlist, not denylist: only agents whose decision logic ran in our engine earn `engine`
  // scope. Any external or unrecognized kind gets the weaker `fed-data-only` certificate, so a
  // future AgentKind cannot silently inherit the full leak-free claim.
  const inProcess =
    params.agentKind === undefined ||
    params.agentKind === "local" ||
    params.agentKind === "strategy-spec";
  const leakScope = inProcess ? "engine" : "fed-data-only";

  return {
    agent: agent.name,
    symbol,
    timeframe,
    startTs: bars[0]!.openTime,
    endTs: lastBar.openTime,
    startEquity: config.startEquity,
    endEquity,
    metrics,
    equityCurve,
    trades: portfolio.trades,
    leakCertificate: auditor.certificate(leakScope),
    journal: [...journal.entries],
    journalRoot: journal.root,
  };
}
