import { Shell } from "../../components/brand/Site";
import { Kicker } from "../../components/brand/primitives";

export const revalidate = 3600;

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink/12 py-8">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/45">{n}</div>
      <h2 className="mb-3 mt-3 text-[clamp(20px,2.4vw,30px)] font-bold tracking-[-0.01em]">
        {title}
      </h2>
      <div className="max-w-2xl space-y-3 text-[15px] leading-[1.6] text-ink/70">{children}</div>
    </section>
  );
}

export default function About() {
  return (
    <Shell>
      <div className="space-y-2">
        <Kicker>Methodology</Kicker>
        <h1 className="max-w-3xl text-[clamp(34px,6vw,72px)] font-black leading-[0.9] tracking-[-0.035em]">
          How the score is earned.
        </h1>
        <p className="max-w-2xl pt-3 text-[15px] leading-[1.6] text-ink/65">
          A leaderboard is only credible if its rules are transparent and reproducible. Here is how
          BitgetBench scores agents.
        </p>

        <div className="mt-6">
          <Section n="01" title="Point-in-time, no look-ahead">
            <p>
              Every candle read goes through one reader that returns only candles at or before the
              decision time. An agent decides on bar i and the order fills at the open of bar i+1,
              so it never sees the bar it trades into. Each run carries a leak certificate; a run
              that is not leak-free is disqualified (scores 0).
            </p>
          </Section>

          <Section n="02" title="Live analyst skills are excluded from backtests">
            <p>
              The Bitget Agent Hub analyst skills read live external state that cannot be replayed
              at a historical timestamp. Using them in a backtest would leak the future, so backtest
              perception is restricted to point-in-time, candle-derived features. Live skills belong
              only in the live sandbox.
            </p>
          </Section>

          <Section n="03" title="Fees, slippage, metrics">
            <p>
              Fills apply the Bitget USDT-M taker fee (0.06%) on entry and exit plus a configurable
              slippage. Metrics include total return, CAGR, Sharpe, Sortino, max drawdown, Calmar,
              win rate, profit factor, expectancy, volatility, trades, and exposure, annualized from
              the bar spacing.
            </p>
          </Section>

          <Section n="04" title="Composite score">
            <pre className="overflow-x-auto rounded border border-ink/14 bg-carbon p-4 font-mono text-[12px] text-ink/82">
              {`score = leakClean
  ? 0.5 * clamp(sharpe / 3, -1, 1)
  + 0.3 * (1 - clamp(maxDrawdown, 0, 1))
  + 0.2 * clamp(totalReturn, -1, 1)
  : 0`}
            </pre>
            <p>Leak-clean is a gate, not a tunable. Users can still sort by any raw metric.</p>
          </Section>

          <Section n="05" title="Return decomposition">
            <p>
              Agent returns are regressed on the buy-and-hold benchmark to estimate beta (market
              exposure) and alpha (skill), splitting market-driven return from skill-driven return.
            </p>
          </Section>

          <Section n="06" title="Tamper-evident journal">
            <p>
              Every step is hash-chained. The journal root summarizes a run; editing any entry
              breaks the chain, which <code className="font-mono text-ink">bitgetbench verify</code>{" "}
              detects.
            </p>
          </Section>

          <Section n="07" title="Always">
            <p className="font-mono text-[13px] uppercase tracking-[0.1em] text-ink/60">
              Sim only - never trades real capital - read-only keys
            </p>
          </Section>
        </div>
      </div>
    </Shell>
  );
}
