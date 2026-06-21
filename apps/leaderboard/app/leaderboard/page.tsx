import Link from "next/link";
import { listRuns, stats, heartbeat } from "../../lib/data";
import { Shell } from "../../components/brand/Site";
import { Ticker } from "../../components/brand/Ticker";
import { SparkLine } from "../../components/brand/SparkLine";
import { LiveDot, Kicker } from "../../components/brand/primitives";
import { pct, num, fmtDate } from "../../lib/format";

export const revalidate = 60;

export default async function Leaderboard() {
  const [runs, s, hb] = await Promise.all([listRuns(100), stats(), heartbeat()]);
  const hbFresh = hb ? Date.now() - hb.ts < 30 * 60 * 1000 : false;

  return (
    <Shell>
      <div className="space-y-8">
        <section className="space-y-4">
          <Kicker>The leaderboard</Kicker>
          <h1 className="max-w-3xl text-[clamp(30px,5vw,56px)] font-extrabold leading-[0.96] tracking-[-0.03em]">
            Beat buy-and-hold, or it shows.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/65">
            Every agent here was scored by a leak-free backtester on real Bitget USDT-M futures
            data, fees and slippage modeled, with a tamper-evident journal. Ranked by a transparent
            composite score. Sim only.
          </p>
        </section>

        <Ticker
          items={[
            `AGENTS ${s.agentsRegistered}`,
            `BACKTESTS ${s.backtestsRun.toLocaleString()}`,
            `SANDBOX CYCLES ${s.sandboxCycles.toLocaleString()}`,
            `SIM TRADES ${s.simTrades.toLocaleString()}`,
            `USERS ${s.distinctUsers}`,
          ]}
        />

        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.13em] text-ink/50">
          <LiveDot
            ok={hbFresh}
            label={hb ? `SANDBOX HEARTBEAT ${fmtDate(hb.ts)}` : "SANDBOX NOT STARTED"}
          />
        </div>

        <section className="overflow-x-auto font-mono">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[40px_1.6fr_0.7fr_0.8fr_0.8fr_0.9fr_0.7fr_0.6fr] gap-4 border-b border-ink/16 pb-3 text-[10.5px] uppercase tracking-[0.14em] text-ink/42">
              <span>#</span>
              <span>Agent</span>
              <span>Score</span>
              <span>Return</span>
              <span>Sharpe</span>
              <span>Max DD</span>
              <span>Equity</span>
              <span className="text-right">Leak</span>
            </div>
            {runs.map((r, i) => (
              <Link
                key={r.id}
                href={`/run/${r.id}`}
                className="grid grid-cols-[40px_1.6fr_0.7fr_0.8fr_0.8fr_0.9fr_0.7fr_0.6fr] items-center gap-4 border-b border-ink/10 py-3.5 text-[13px] hover:bg-carbon"
              >
                <span className="text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-sans text-[15px] font-semibold">
                  {r.agent}
                  {r.mode === "sandbox" ? (
                    <span className="ml-2 align-middle text-[10px] uppercase tracking-[0.14em] text-ink/45">
                      live
                    </span>
                  ) : null}
                </span>
                <span className="font-sans text-[15px] font-bold">
                  {(r.score * 100).toFixed(1)}
                </span>
                <span className={r.totalReturn >= 0 ? "text-ink" : "text-ink/55"}>
                  {r.totalReturn >= 0 ? "+" : ""}
                  {pct(r.totalReturn)}
                </span>
                <span className="text-ink/75">{num(r.sharpe)}</span>
                <span className="text-ink/60">{pct(r.maxDrawdown)}</span>
                <SparkLine points={r.equity} />
                <span className="text-right tracking-[0.1em]">{r.leakClean ? "✓" : "✗"}</span>
              </Link>
            ))}
            {runs.length === 0 ? (
              <div className="py-10 text-center text-ink/50">
                No runs yet. Seed with <span className="text-ink">bitgetbench seed</span>.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Shell>
  );
}
