// Public surface of @bitgetbench/core. Phase 0 ships the type contract only.
// Engine (replay loop, portfolio, fill simulator, scoring, leak audit, journal)
// lands in Phases 1 and 2.
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
} from "./types.js";
