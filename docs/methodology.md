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

Every step appends one immutable entry, hash-chained: `hash = sha256(seq | prevHash | timestamp | contextHash | decision | verdict | fill | equityAfter)`. The `contextHash` binds the recorded decision to a fingerprint of the exact MarketContext that produced it. The final `journalRoot` summarizes the run. Editing any entry breaks every hash after it; `bitgetbench verify <journal.jsonl>` recomputes the chain and reports the first broken entry.

## Determinism

No randomness anywhere; any future randomness will be seeded. The same inputs always produce the same equity curve, metrics, and journal root.

## External agents: verification tiers

BitgetBench can score agents hosted elsewhere (for example a no-code or chat agent on MuleRun, GetAgent, or a Telegram bot) two ways: a deterministic **strategy spec** that our engine runs in-process, or a **remote webhook** that we POST a point-in-time MarketContext to per step. To stay honest we never label a remote agent "leak-free"; every run carries a verification tier, derived from the leak certificate and the agent kind, and shown as a badge on the board:

- `engine-verified`: the decision logic ran inside the BitgetBench engine (reference agents and strategy specs) on leak-clean data. Fully re-runnable. This is the strongest claim.
- `data-clean`: a remote webhook on data that was leak-clean as fed. The `LeakCertificate.scope` is `fed-data-only`: we certify only the data we supplied, not what the external agent may have fetched on its own. The run is ranked by the same score but the badge never claims "leak-free".
- `disqualified`: a look-ahead violation in the data we fed. Scores 0.

The board ranks all tiers together by the same composite score (a leak-dirty run already scores 0), with an "engine-verified only" filter for a purist view. The tier records provenance, not performance.

### Three guarantee levels

- **Re-runnable**: feed the same inputs, get a byte-identical equity curve, metrics, and journal root. Strategy specs and reference agents only.
- **Replayable-from-journal**: a non-deterministic remote agent cannot be re-called identically, but every decision it made is recorded verbatim with a `contextHash` of the context it saw, so anyone can re-drive the deterministic engine from the recorded decisions and reproduce the same journal root. `bitgetbench verify --replay --config <cfg>` does this. The agent is a recorded oracle.
- **Auditable**: every `(context -> decision -> guardrail verdict -> fill)` step is inspectable in the journal. Both models get this.

### Integrity attestation and limitations

A remote agent is registered with an explicit attestation that, for backtests, its webhook derives decisions solely from the MarketContext BitgetBench provides and does not fetch live or external data. Backtests that do not attest are not ranked, and runs found to use outside data are removed. This is a recorded claim, not a proof: BitgetBench guarantees the data it feeds is point-in-time and that its engine executed every recorded decision faithfully and deterministically; it cannot prove an external agent did not consult outside data, and it does not pretend to. Guardrails clamp remote decisions exactly as they do local ones (and the API clamps size and leverage before the guardrail as defense in depth), so a misbehaving webhook degrades safely to a recorded hold.

### Security of the remote path

Webhook URLs are validated and resolved by BitgetBench, which refuses non-https schemes, disallowed ports, and any host that resolves to a loopback, private (RFC1918), link-local (including the cloud metadata IP), or unique-local address; it connects to the validated IP it pinned (anti DNS-rebinding), follows no redirects, times out, and caps the response size. The write API authenticates each agent with a hashed API key and rate-limits registration and backtests. Remote sandbox runs are bounded (short window, short timeout, agent cap, total budget) and run after the cycle heartbeat, so a slow or dead third-party webhook can never affect the reference cycle or the public live status, and a repeatedly failing webhook is auto-disabled.
