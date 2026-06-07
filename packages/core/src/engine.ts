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
} from "./types.js";
import { Portfolio } from "./portfolio.js";
import { computeMetrics } from "./metrics.js";

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

    const decision = await agent.decide(ctx);
    const leverage = decision.leverage ?? 1;
    const fillTs = fillBar.openTime;
    const ref = fillBar.open;

    switch (decision.action) {
      case "long":
        if (!portfolio.hasPosition()) {
          portfolio.openPosition("long", ref, decision.sizePct, leverage, fillTs);
        } else if (portfolio.position!.side === "short") {
          portfolio.closePosition(ref, fillTs);
          portfolio.openPosition("long", ref, decision.sizePct, leverage, fillTs);
        }
        break;
      case "short":
        if (!portfolio.hasPosition()) {
          portfolio.openPosition("short", ref, decision.sizePct, leverage, fillTs);
        } else if (portfolio.position!.side === "long") {
          portfolio.closePosition(ref, fillTs);
          portfolio.openPosition("short", ref, decision.sizePct, leverage, fillTs);
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

    if (portfolio.hasPosition()) barsWithPosition += 1;
    equityCurve.push({ timestamp: fillBar.openTime, equity: portfolio.equity(fillBar.close) });
  }

  // Settle any open position into the trade log (no cash change) so metrics are defined.
  const lastBar = bars[bars.length - 1]!;
  portfolio.settleOpenPosition(lastBar.close, lastBar.openTime);

  const exposure = barsWithPosition / (bars.length - 1);
  const metrics = computeMetrics(equityCurve, portfolio.trades, { stepMs, exposure });
  const endEquity = equityCurve[equityCurve.length - 1]!.equity;

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
  };
}
