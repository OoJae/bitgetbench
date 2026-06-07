// Public surface of @bitgetbench/core. Phase 1 adds the backtest engine (portfolio,
// fill simulator, replay loop, metrics) on top of the type contract. Scoring rigor,
// leak audit, and journal land in Phase 2.
export type {
  Candle,
  Position,
  MarketContext,
  AgentDecision,
  BenchAgent,
  GuardRailVerdict,
  Fill,
  JournalEntry,
  Metrics,
  ReturnDecomposition,
  LeakCertificate,
  RunResult,
  PointInTimeReader,
  PointInTimeQueryOptions,
  Trade,
  EquitySample,
  FeeConfig,
  SlippageConfig,
  EngineConfig,
  BacktestRun,
} from "./types.js";

export { fillPrice, takerFeeUsd, simulateFill, type TradeDirection } from "./fills.js";

export { Portfolio } from "./portfolio.js";

export { computeMetrics, stepReturns, maxDrawdown, type MetricsContext } from "./metrics.js";

export { runBacktest, type RunBacktestParams } from "./engine.js";

/** Default USDT-M taker fee: 0.06%. Confirmed against live Bitget docs 2026-06-07. */
export const DEFAULT_TAKER_FEE = 0.0006;
