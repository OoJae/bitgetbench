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

/** A simulated fill. */
export interface Fill {
  price: number;
  sizeUsd: number;
  feeUsd: number;
  slippageBps: number;
}

/**
 * One immutable journal entry per step, hash-chained.
 * hash = sha256(seq | prevHash | timestamp | decision | verdict | fill | equityAfter).
 */
export interface JournalEntry {
  seq: number;
  prevHash: string;
  timestamp: number;
  decision: AgentDecision;
  verdict: GuardRailVerdict;
  fill: Fill | null;
  equityAfter: number;
  hash: string;
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

/** Evidence that a run never read future data. */
export interface LeakCertificate {
  clean: boolean;
  maxLookaheadMs: number;
  checkedSteps: number;
  violations: number;
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
