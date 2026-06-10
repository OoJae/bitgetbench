export const dynamic = "force-dynamic";

export default function About() {
  return (
    <article className="prose-invert max-w-2xl space-y-4 text-sm leading-6">
      <h1 className="text-xl font-semibold">Methodology</h1>
      <p className="text-muted">
        A leaderboard is only credible if its rules are transparent and reproducible. Here is how
        BitgetBench scores agents.
      </p>

      <h2 className="text-base font-medium">Point-in-time, no look-ahead</h2>
      <p className="text-muted">
        Every candle read goes through one reader that returns only candles at or before the
        decision time. An agent decides on bar i and the order fills at the open of bar i+1, so it
        never sees the bar it trades into. Each run carries a leak certificate; a run that is not
        leak-free is disqualified (scores 0).
      </p>

      <h2 className="text-base font-medium">Live analyst skills are excluded from backtests</h2>
      <p className="text-muted">
        The Bitget Agent Hub analyst skills read live external state that cannot be replayed at a
        historical timestamp. Using them in a backtest would leak the future, so backtest perception
        is restricted to point-in-time, candle-derived features. Live skills belong only in the live
        sandbox.
      </p>

      <h2 className="text-base font-medium">Fees, slippage, metrics</h2>
      <p className="text-muted">
        Fills apply the Bitget USDT-M taker fee (0.06%) on entry and exit plus a configurable
        slippage. Metrics include total return, CAGR, Sharpe, Sortino, max drawdown, Calmar, win
        rate, profit factor, expectancy, volatility, trades, and exposure, annualized from the bar
        spacing.
      </p>

      <h2 className="text-base font-medium">Composite score</h2>
      <pre className="overflow-x-auto rounded border border-edge bg-panel p-3 text-xs">
        {`score = leakClean
  ? 0.5 * clamp(sharpe / 3, -1, 1)
  + 0.3 * (1 - clamp(maxDrawdown, 0, 1))
  + 0.2 * clamp(totalReturn, -1, 1)
  : 0`}
      </pre>

      <h2 className="text-base font-medium">Return decomposition</h2>
      <p className="text-muted">
        Agent returns are regressed on the buy-and-hold benchmark to estimate beta (market exposure)
        and alpha (skill), splitting market-driven return from skill-driven return.
      </p>

      <h2 className="text-base font-medium">Tamper-evident journal</h2>
      <p className="text-muted">
        Every step is hash-chained. The journal root summarizes a run; editing any entry breaks the
        chain, which <code>bitgetbench verify</code> detects.
      </p>

      <p className="text-muted">
        Sim only. No real capital, no write or trade API permissions. Open source, MIT.
      </p>
    </article>
  );
}
