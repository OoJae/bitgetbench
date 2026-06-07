# BitgetBench methodology

This page documents how BitgetBench scores agents and why the results are trustworthy. It is public on purpose: a leaderboard is only credible if its rules are transparent and reproducible.

## Point-in-time discipline (no look-ahead)

Every historical candle read goes through a single reader, `getCandlesUpTo(symbol, timeframe, ts)`, which returns only candles with `openTime <= ts`. The replay loop never reads candles any other way. At each step the agent decides on bar `i` (seeing only candles up to and including `i`), and its order fills at the open of bar `i + 1`. The bar an agent trades into is always strictly after every bar it saw, so there is no same-bar fill.

### Leak certificate

Each run produces a `LeakCertificate { clean, maxLookaheadMs, checkedSteps, violations }`. The engine records, per step, the newest candle openTime the agent saw minus its decision timestamp (must be `<= 0`) and checks that the fill bar is strictly later. A clean run has `maxLookaheadMs <= 0` and zero violations. A run that is not clean is disqualified from the composite score (scores 0).

## Why live analyst skills are excluded from backtests

The Bitget Agent Hub ships analyst skills (sentiment, macro, news, on-chain) that read live external state. That data cannot be replayed at a historical timestamp, so using it inside a backtest would leak future information and make results irreproducible. BitgetBench therefore restricts backtest perception to point-in-time, candle-derived features (the same OHLCV math the technical-analysis skill performs). Live analyst-skill perception is available only in the live paper-sandbox, where "now" is a legitimate input. Most backtests that bolt on live sentiment silently leak; BitgetBench refuses to.

## Fees and slippage

Fills apply the Bitget USDT-M taker fee (0.06%, configurable) on both entry and exit, plus a configurable slippage in basis points applied adversely to the fill price (a buy pays up, a sell receives less). The buy-and-hold benchmark runs at leverage 1 and, with zero slippage, reconciles exactly to asset return minus the single entry fee.

## Metrics

From the per-bar equity curve and the trade log: total return, CAGR, Sharpe, Sortino, max drawdown, Calmar, win rate, profit factor, expectancy, volatility, trades, and exposure. Sharpe and Sortino use a zero risk-free rate and are annualized by the square root of the number of bars per year, inferred from the bar spacing. All ratios guard divide-by-zero (a flat curve yields zeros, never NaN).

## Return decomposition

Agent per-step returns are regressed on the benchmark (buy-and-hold) per-step returns by ordinary least squares: `r_agent = alpha + beta * r_benchmark`. `beta` is market exposure, `alpha` is the per-step intercept (skill). We report `marketReturn = beta * benchmarkTotalReturn` and `skillReturn = agentTotalReturn - marketReturn`, separating drift from skill.

## Walk-forward

The window is split into N contiguous, non-overlapping folds and the agent is evaluated on each. For fixed-rule agents (no in-sample fitting) this is segmented out-of-sample evaluation: it shows robustness across market regimes rather than performance on a single lucky window.

## Composite score

One transparent number for the default ranking. Users can still sort by any raw metric.

```
score = leakClean
  ? 0.5 * clamp(sharpe / 3, -1, 1)
  + 0.3 * (1 - clamp(maxDrawdown, 0, 1))
  + 0.2 * clamp(totalReturn, -1, 1)
  : 0
```

Leak-clean is a gate, not a tunable: a run that is not leak-free scores 0. Sharpe is divided by 3 before clamping, so a Sharpe of 3 saturates that term. The score lands roughly in `[-1, 1]`, higher is better.

## GuardRail (risk middleware)

Every decision passes through a pure, synchronous guardrail before it fills. It is configured by a declarative JSON policy so users tune limits without code:

- `maxPositionPct`, `maxLeverage`, `maxNotionalPct`: clamp the intended size and leverage (and their product) down to the caps. Clamps are recorded with reasons but are not "blocks".
- Daily-loss circuit breaker (`dailyLossLimitPct`, `breakerCooldownMs`, `halfOpenSizeFactor`): three states. Closed allows trading. It opens when the day PnL falls to the loss limit and blocks all new risk. After the cooldown it moves to half-open, allowing new risk at a reduced size. A new UTC day re-arms it to closed.
- Drawdown kill-switch (`drawdownKillPct`): terminal. When equity falls this far from its peak, the guardrail forces a close and blocks all new risk for the rest of the run.
- `symbolAllow` / `symbolDeny`: optional per-symbol gating.

Closing and holding are always allowed (they reduce risk). Every clamp or block produces a human-readable reason, and the verdict is written into the journal entry for that step, so the full risk-control trail is auditable.

## Tamper-evident journal

Every step appends one immutable entry, hash-chained: `hash = sha256(seq | prevHash | timestamp | decision | verdict | fill | equityAfter)`. The final `journalRoot` summarizes the run. Editing any entry breaks every hash after it; `bitgetbench verify <journal.jsonl>` recomputes the chain and reports the first broken entry.

## Determinism

No randomness anywhere; any future randomness will be seeded. The same inputs always produce the same equity curve, metrics, and journal root.
