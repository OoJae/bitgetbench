import { notFound } from "next/navigation";
import Link from "next/link";
import { runDetail } from "../../../lib/data";
import { EquityChart, DrawdownChart } from "../../../components/Charts";
import { Shell } from "../../../components/brand/Site";
import { CornerTicks } from "../../../components/brand/CornerTicks";
import { TierTag, KindTag } from "../../../components/brand/primitives";
import { pct, num, usd, shortHash, fmtDate } from "../../../lib/format";

export const revalidate = 60;
export const dynamicParams = true;

function Metric({
  label,
  value,
  signed,
}: {
  label: string;
  value: string;
  /** When set, color the value green/red by sign (P&L-only color exception). */
  signed?: number;
}) {
  const tone = signed === undefined ? "" : signed >= 0 ? "text-up" : "text-down";
  return (
    <div className="border border-ink/12 bg-carbon px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">{label}</div>
      <div className={`mt-1 font-sans tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  // Next hands page params URL-encoded (route handlers decode, pages do not), and our run
  // ids contain ":" (e.g. "sandbox:buy-and-hold:BTCUSDT:15m"), so decode before lookup.
  const id = decodeURIComponent(rawId);
  const detail = await runDetail(id);
  if (!detail) notFound();
  const { run, trades } = detail;

  return (
    <Shell>
      <div className="space-y-8">
        <div>
          <Link
            href="/leaderboard"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/50 hover:text-ink"
          >
            &larr; leaderboard
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-[clamp(24px,3vw,40px)] font-extrabold tracking-[-0.02em]">
              {run.agent}
            </h1>
            <span className="rounded-full border border-ink/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/55">
              {run.label}
            </span>
            <TierTag tier={run.verificationTier} />
            <KindTag kind={run.agentKind} />
            {run.mode === "sandbox" ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                live sandbox
              </span>
            ) : null}
          </div>
          {run.verificationTier === "data-clean" ? (
            <p className="mt-3 max-w-2xl border-l border-ink/20 pl-3 font-mono text-[11px] leading-5 text-ink/50">
              BitgetBench fed this externally-hosted agent only point-in-time candles (every
              openTime &lt;= the decision time). BitgetBench cannot observe or prevent data the
              agent fetched on its own, so the leak guarantee covers BitgetBench-supplied data only.
              Every decision is recorded in the journal, so the run is auditable and replayable.
            </p>
          ) : null}
          <p className="mt-2 font-mono text-[12px] tracking-[0.04em] text-ink/55">
            {run.symbol} - {run.timeframe} - {fmtDate(run.startTs)} to {fmtDate(run.endTs)} - start{" "}
            {usd(run.startEquity)} USDT
          </p>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <CornerTicks label="EQUITY" className="bg-carbon p-3 pt-8">
            <EquityChart points={run.equity} />
          </CornerTicks>
          <CornerTicks label="DRAWDOWN" className="bg-carbon p-3 pt-8">
            <DrawdownChart points={run.equity} />
          </CornerTicks>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
            Metrics
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Score" value={(run.score * 100).toFixed(1)} />
            <Metric
              label="Return"
              value={`${run.totalReturn >= 0 ? "+" : ""}${pct(run.totalReturn)}`}
              signed={run.totalReturn}
            />
            <Metric label="CAGR" value={pct(run.cagr)} signed={run.cagr} />
            <Metric label="Sharpe" value={num(run.sharpe)} />
            <Metric label="Sortino" value={num(run.sortino)} />
            <Metric label="Max DD" value={pct(run.maxDrawdown)} />
            <Metric label="Calmar" value={num(run.calmar)} />
            <Metric label="Win rate" value={pct(run.winRate, 1)} />
            <Metric label="Profit factor" value={num(run.profitFactor)} />
            <Metric label="Expectancy" value={usd(run.expectancy)} />
            <Metric label="Volatility" value={num(run.volatility)} />
            <Metric label="Exposure" value={pct(run.exposure, 1)} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="border border-ink/12 bg-carbon p-3">
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
              Buy-and-hold benchmark
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Return"
                value={pct(run.benchmark.totalReturn)}
                signed={run.benchmark.totalReturn}
              />
              <Metric label="Sharpe" value={num(run.benchmark.sharpe)} />
              <Metric label="Max DD" value={pct(run.benchmark.maxDrawdown)} />
            </div>
          </div>
          <div className="border border-ink/12 bg-carbon p-3">
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
              Return decomposition
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Alpha/step" value={run.alpha.toExponential(2)} signed={run.alpha} />
              <Metric label="Beta" value={num(run.beta, 3)} />
              <Metric label="Market" value={pct(run.marketReturn)} signed={run.marketReturn} />
              <Metric label="Skill" value={pct(run.skillReturn)} signed={run.skillReturn} />
            </div>
          </div>
        </section>

        <section className="border border-ink/12 bg-carbon p-4">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
            Tamper-evident journal
          </h2>
          <p className="text-sm text-ink/65">
            Journal root <code className="font-mono text-ink">{shortHash(run.journalRoot)}</code>.
            Every step is hash-chained. Re-run the agent and verify with{" "}
            <code className="font-mono text-ink">bitgetbench verify run.journal.jsonl</code>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
            Trades ({trades.length})
          </h2>
          <div className="overflow-x-auto border border-ink/12 font-mono">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-ink/42">
                <tr className="border-b border-ink/12">
                  <th className="px-3 py-2 font-normal">Entry</th>
                  <th className="px-3 py-2 font-normal">Exit</th>
                  <th className="px-3 py-2 font-normal">Side</th>
                  <th className="px-3 py-2 text-right font-normal">Entry px</th>
                  <th className="px-3 py-2 text-right font-normal">Exit px</th>
                  <th className="px-3 py-2 text-right font-normal">PnL</th>
                  <th className="px-3 py-2 text-right font-normal">Return</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 200).map((t) => (
                  <tr key={t.id} className="border-t border-ink/10">
                    <td className="px-3 py-1.5 text-ink/55">{fmtDate(t.entryTs)}</td>
                    <td className="px-3 py-1.5 text-ink/55">{fmtDate(t.exitTs)}</td>
                    <td className="px-3 py-1.5">{t.side}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(t.entry)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(t.exit)}</td>
                    <td
                      className={
                        "px-3 py-1.5 text-right tabular-nums " +
                        (t.pnlUsd >= 0 ? "text-ink" : "text-ink/50")
                      }
                    >
                      {usd(t.pnlUsd)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{pct(t.returnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
