import { notFound } from "next/navigation";
import Link from "next/link";
import { runDetail } from "../../../lib/data";
import { EquityChart, DrawdownChart } from "../../../components/Charts";
import { LeakBadge, LabelTag } from "../../../components/Badge";
import { pct, num, usd, shortHash, fmtDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-edge bg-panel px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = runDetail(id);
  if (!detail) notFound();
  const { run, trades } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          &larr; leaderboard
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{run.agent}</h1>
          <LabelTag label={run.label} />
          <LeakBadge clean={run.leakClean} />
          {run.mode === "sandbox" ? (
            <span className="text-xs text-accent">live sandbox</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {run.symbol} {run.timeframe} - {fmtDate(run.startTs)} to {fmtDate(run.endTs)} - start{" "}
          {usd(run.startEquity)} USDT
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-edge bg-panel p-3">
          <div className="mb-1 text-sm font-medium">Equity</div>
          <EquityChart points={run.equity} />
        </div>
        <div className="rounded-lg border border-edge bg-panel p-3">
          <div className="mb-1 text-sm font-medium">Drawdown</div>
          <DrawdownChart points={run.equity} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Metrics</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Score" value={num(run.score, 3)} />
          <Metric label="Return" value={pct(run.totalReturn)} />
          <Metric label="CAGR" value={pct(run.cagr)} />
          <Metric label="Sharpe" value={num(run.sharpe)} />
          <Metric label="Sortino" value={num(run.sortino)} />
          <Metric label="Max DD" value={pct(run.maxDrawdown)} />
          <Metric label="Calmar" value={num(run.calmar)} />
          <Metric label="Win rate" value={pct(run.winRate, 1)} />
          <Metric label="Profit factor" value={num(run.profitFactor)} />
          <Metric label="Expectancy" value={`${usd(run.expectancy)}`} />
          <Metric label="Volatility" value={num(run.volatility)} />
          <Metric label="Exposure" value={pct(run.exposure, 1)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-edge bg-panel p-3">
          <h2 className="mb-2 text-sm font-medium">Buy-and-hold benchmark</h2>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Return" value={pct(run.benchmark.totalReturn)} />
            <Metric label="Sharpe" value={num(run.benchmark.sharpe)} />
            <Metric label="Max DD" value={pct(run.benchmark.maxDrawdown)} />
          </div>
        </div>
        <div className="rounded-lg border border-edge bg-panel p-3">
          <h2 className="mb-2 text-sm font-medium">Return decomposition</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Alpha/step" value={run.alpha.toExponential(2)} />
            <Metric label="Beta" value={num(run.beta, 3)} />
            <Metric label="Market" value={pct(run.marketReturn)} />
            <Metric label="Skill" value={pct(run.skillReturn)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-panel p-3">
        <h2 className="mb-1 text-sm font-medium">Tamper-evident journal</h2>
        <p className="text-sm text-muted">
          Journal root <code className="text-ink">{shortHash(run.journalRoot)}</code>. Every step is
          hash-chained. Re-run the agent and verify with{" "}
          <code className="text-ink">bitgetbench verify run.journal.jsonl</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Trades ({trades.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-panel text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">Exit</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2 text-right">Entry px</th>
                <th className="px-3 py-2 text-right">Exit px</th>
                <th className="px-3 py-2 text-right">PnL</th>
                <th className="px-3 py-2 text-right">Return</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 200).map((t) => (
                <tr key={t.id} className="border-t border-edge">
                  <td className="px-3 py-1.5 text-muted">{fmtDate(t.entryTs)}</td>
                  <td className="px-3 py-1.5 text-muted">{fmtDate(t.exitTs)}</td>
                  <td className="px-3 py-1.5">{t.side}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(t.entry)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(t.exit)}</td>
                  <td
                    className={
                      "px-3 py-1.5 text-right tabular-nums " +
                      (t.pnlUsd >= 0 ? "text-accent" : "text-danger")
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
  );
}
