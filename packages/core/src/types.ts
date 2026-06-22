// BitgetBench core type contract. This is the integration surface every contestant
// implements against. Keep it stable; engine, guardrail, journal, and leaderboard all
// hang off these shapes. No logic lives here, only types.

/** A single OHLCV candle. openTime is the bar open in epoch milliseconds. */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** An open sim position. sizeUsd is notional. */
export interface Position {
  side: "long" | "short";
  sizeUsd: number;
  entry: number;
  leverage: number;
}

/**
 * The context handed to an agent at one decision step. BitgetBench guarantees that
 * `candles` contains NO data after `timestamp`: every candle.openTime <= timestamp.
 */
export interface MarketContext {
  /** Decision time in epoch milliseconds. */
  timestamp: number;
  /** e.g. "BTCUSDT". */
  symbol: string;
  /** e.g. "15m". */
  timeframe: string;
  /** Point-in-time candles, ascending by openTime, all with openTime <= timestamp. */
  candles: Candle[];
  /** Current sim position, or null if flat. */
  position: Position | null;
  /** Current sim equity in USDT. */
  equity: number;
}

/** The decision an agent returns. Sizing and leverage are pre-guardrail intent. */
export interface AgentDecision {
  action: "long" | "short" | "close" | "hold";
  symbol: string;
  /** Intended fraction of equity to commit, 0..1, pre-guardrail. */
  sizePct: number;
  /** Intended leverage, pre-guardrail. */
  leverage?: number;
  /** Recorded verbatim in the journal. */
  rationale: string;
  /** Optional self-reported confidence, 0..1. */
  confidence?: number;
}

/**
 * The single interface a contestant implements. This is the whole integration surface.
 * `decide` must not perform look-ahead: it only sees ctx.
 */
export interface BenchAgent {
  name: string;
  decide(ctx: MarketContext): Promise<AgentDecision>;
}

/** The result of running a decision through the guardrail middleware. */
export interface GuardRailVerdict {
  /** The decision actually allowed, possibly clamped or downgraded to "hold". */
  allowed: AgentDecision;
  blocked: boolean;
  /** Human-readable reasons for any clamp or block, recorded in the journal. */
  reasons: string[];
}

/**
 * Risk middleware the engine drives each step. Defined here (not in @bitgetbench/guardrail)
 * so the engine can use it by interface without a dependency cycle: guardrail imports core
 * types, core never imports guardrail. The implementation lives in @bitgetbench/guardrail.
 */
export interface GuardRail {
  /** Called once per bar with the equity entering the step, before the decision. */
  onStep(equity: number, ts: number): void;
  /** Pure given current internal state: clamp or block the decision. */
  apply(decision: AgentDecision): GuardRailVerdict;
}

/** A simulated fill. */
export interface Fill {
  price: number;
  sizeUsd: number;
  feeUsd: number;
  slippageBps: number;
}

/** Forensic metadata for a decision sourced from a remote webhook. Not part of the hash. */
export interface AgentResponseMeta {
  /** The verbatim body the webhook returned, before parsing/clamping. */
  raw: unknown;
  /** Round-trip latency of the webhook call in ms. A soft signal of external IO. */
  latencyMs: number;
  /** HTTP status the webhook returned. */
  httpStatus: number;
}

/**
 * One immutable journal entry per step, hash-chained.
 * hash = sha256(seq | prevHash | timestamp | contextHash | decision | verdict | fill | equityAfter).
 * `contextHash` binds the recorded decision to the exact MarketContext that produced it.
 */
export interface JournalEntry {
  seq: number;
  prevHash: string;
  timestamp: number;
  /** sha256 of a stable fingerprint of the MarketContext the agent saw this step. */
  contextHash: string;
  decision: AgentDecision;
  verdict: GuardRailVerdict;
  fill: Fill | null;
  equityAfter: number;
  hash: string;
  /** Present only for remote-webhook agents; recorded for audit, not hashed. */
  agentResponse?: AgentResponseMeta;
}

/** Performance and risk metrics computed from an equity curve and trade list. */
export interface Metrics {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  volatility: number;
  trades: number;
  /** Fraction of time the strategy held a position, 0..1. */
  exposure: number;
}

/** Decomposition of agent returns into market-driven and skill-driven components. */
export interface ReturnDecomposition {
  alpha: number;
  beta: number;
  marketReturn: number;
  skillReturn: number;
}

/**
 * How much of the decision path the leak audit covers.
 * - `engine`: the decision logic ran in-process, so leak-freedom is complete.
 * - `fed-data-only`: the agent is external (a remote webhook); we certify only that the
 *   data BitgetBench fed it was point-in-time, not what the agent fetched on its own.
 */
export type LeakScope = "engine" | "fed-data-only";

/** What an agent's decision logic is and where it ran. */
export type AgentKind = "local" | "strategy-spec" | "remote-webhook";

/**
 * Honest provenance label for a run on the board, derived from leak cleanliness + scope.
 * - `engine-verified`: leak-clean, decision ran in our engine, fully re-runnable.
 * - `data-clean`: leak-clean inputs, but an external agent we cannot fully verify.
 * - `disqualified`: a look-ahead violation in the data we fed (scores 0).
 */
export type VerificationTier = "engine-verified" | "data-clean" | "disqualified";

/** Evidence that a run never read future data. */
export interface LeakCertificate {
  clean: boolean;
  maxLookaheadMs: number;
  checkedSteps: number;
  violations: number;
  /** What the certificate covers. Defaults to `engine` for in-process agents. */
  scope: LeakScope;
}

/** The full result of one backtest or sandbox run. */
export interface RunResult {
  agent: string;
  symbol: string;
  timeframe: string;
  startTs: number;
  endTs: number;
  startEquity: number;
  endEquity: number;
  metrics: Metrics;
  /** Buy-and-hold over the same window. */
  benchmark: Metrics;
  decomposition: ReturnDecomposition;
  leakCertificate: LeakCertificate;
  /** Final hash of the journal chain. */
  journalRoot: string;
  /** Transparent composite ranking score (see packages/core/src/score.ts). */
  score: number;
  /** What the agent is and where it ran. Defaults to `local` for reference agents. */
  agentKind: AgentKind;
  /** Honest provenance label for the board, derived from leak scope + cleanliness. */
  verificationTier: VerificationTier;
}

// --- Engine (Phase 1) -------------------------------------------------------

/** One closed trade in the trade log. returnPct is pnl relative to margin committed. */
export interface Trade {
  entryTs: number;
  exitTs: number;
  side: "long" | "short";
  entry: number;
  exit: number;
  /** Base quantity, always positive; sign is carried by `side`. */
  qty: number;
  pnlUsd: number;
  feeUsd: number;
  returnPct: number;
}

/** One equity-curve sample, taken at a bar close. */
export interface EquitySample {
  timestamp: number;
  equity: number;
}

/** Fee model. takerFee is a fraction of notional, e.g. 0.0006 for 0.06%. */
export interface FeeConfig {
  takerFee: number;
}

/** Slippage model. bps is applied adversely to the fill price. */
export interface SlippageConfig {
  bps: number;
}

/** Configuration for one backtest run. */
export interface EngineConfig {
  startEquity: number;
  fees: FeeConfig;
  slippage: SlippageConfig;
  /** If set, cap the candles handed to the agent to the most recent N at each step. */
  contextLookback?: number;
}

/** The result of one backtest run. The leak certificate and hash-chained journal are
 * produced inline by the replay loop; RunResult is the higher-level benchmarked aggregate. */
export interface BacktestRun {
  agent: string;
  symbol: string;
  timeframe: string;
  startTs: number;
  endTs: number;
  startEquity: number;
  endEquity: number;
  metrics: Metrics;
  equityCurve: EquitySample[];
  trades: Trade[];
  leakCertificate: LeakCertificate;
  journal: JournalEntry[];
  journalRoot: string;
}

/**
 * The single chokepoint against look-ahead bias. Implemented in packages/data.
 * Returns only candles with openTime <= ts, ascending. The replay loop must never
 * read candles by any other path.
 */
export interface PointInTimeReader {
  getCandlesUpTo(
    symbol: string,
    timeframe: string,
    ts: number,
    opts?: PointInTimeQueryOptions,
  ): Candle[];
}

export interface PointInTimeQueryOptions {
  /** If set, return at most this many of the most recent candles at or before ts. */
  lookback?: number;
}
