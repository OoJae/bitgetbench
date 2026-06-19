import Link from "next/link";
import { listRuns, stats, heartbeat } from "../lib/data";
import { Counters } from "../components/Counters";
import { LeakBadge, LabelTag } from "../components/Badge";
import { Qr } from "../components/Qr";
import { pct, num, fmtDate } from "../lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [runs, s, hb] = await Promise.all([listRuns(100), stats(), heartbeat()]);
  const hbFresh = hb ? Date.now() - hb.ts < 30 * 60 * 1000 : false;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-edge bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">
            Benchmark your Bitget agent <span className="text-accent">honestly</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            BitgetBench runs any Bitget Agent Hub agent through a leak-free backtester and a live
            paper-trading sandbox on real USDT-M futures data, enforces risk guardrails, and writes
            a tamper-evident journal. Ranked by a transparent composite score. Sim only.
          </p>
          <div className="rounded border border-edge bg-bg p-3 font-mono text-xs text-ink">
            <div className="text-muted"># integrate in three commands</div>
            <div>npx bitgetbench init</div>
            <div>bitgetbench backtest --config bitgetbench.config.json --submit</div>
            <div>bitgetbench verify run.journal.jsonl</div>
          </div>
          <Link href="/about" className="inline-block text-sm text-accent hover:underline">
            How scoring works (methodology) &rarr;
          </Link>
        </div>
        {siteUrl ? <Qr url={siteUrl} /> : null}
      </section>

      <Counters stats={s} />

      <div className="flex items-center gap-2 text-xs text-muted">
        <span
          className={"inline-block h-2 w-2 rounded-full " + (hbFresh ? "bg-accent" : "bg-danger")}
        />
        {hb
          ? `sandbox heartbeat ${fmtDate(hb.ts)} (${hb.ok ? "ok" : "error"})`
          : "sandbox not started"}
      </div>

      <section className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-panel text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">Return</th>
              <th className="px-3 py-2 text-right">Sharpe</th>
              <th className="px-3 py-2 text-right">Max DD</th>
              <th className="px-3 py-2 text-right">Trades</th>
              <th className="px-3 py-2">Audit</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={r.id} className="border-t border-edge hover:bg-panel/60">
                <td className="px-3 py-2 tabular-nums text-muted">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/run/${r.id}`} className="font-medium hover:text-accent">
                    {r.agent}
                  </Link>{" "}
                  <LabelTag label={r.label} />
                  {r.mode === "sandbox" ? (
                    <span className="ml-1 text-xs text-accent">live</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{num(r.score, 3)}</td>
                <td
                  className={
                    "px-3 py-2 text-right tabular-nums " +
                    (r.totalReturn >= 0 ? "text-accent" : "text-danger")
                  }
                >
                  {pct(r.totalReturn)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{num(r.sharpe)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.maxDrawdown)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.trades}</td>
                <td className="px-3 py-2">
                  <LeakBadge clean={r.leakClean} />
                </td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted">
                  No runs yet. Seed with <code>bitgetbench seed</code>.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
