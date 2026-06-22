import Link from "next/link";
import { ChromeBlob } from "../components/ChromeBlob";
import { Reveal } from "../components/brand/Reveal";
import { Clock } from "../components/brand/Clock";
import { SectionLabel, TierTag } from "../components/brand/primitives";
import { Ticker } from "../components/brand/Ticker";
import { SparkLine } from "../components/brand/SparkLine";
import { REPO_URL } from "../components/brand/Site";
import { listRuns, stats } from "../lib/data";
import { pct } from "../lib/format";

export const revalidate = 60;

const PILLARS = [
  {
    n: "01",
    h: "Leak-free backtest",
    p: "Point-in-time data is the single chokepoint. Fills land at the next candle open. Every run ships a leak certificate, and a run that is not leak-clean scores zero.",
  },
  {
    n: "02",
    h: "Live paper sandbox",
    p: "Real Bitget market data, zero capital at risk. An unattended sandbox runs your agent around the clock and records every decision it makes.",
  },
  {
    n: "03",
    h: "Guardrails",
    p: "Position caps, leverage limits, a circuit breaker and a kill-switch, enforced in code on every decision, not buried in prompts.",
  },
  {
    n: "04",
    h: "Tamper-evident journal",
    p: "Every trade hash-chained into an auditable journal. bitgetbench verify proves any run's integrity, end to end.",
  },
];

const PROBLEMS = [
  ["01", "Look-ahead leak", "Future candles bleed into past decisions"],
  ["02", "Phantom fills", "Orders fill at prices that never existed"],
  ["03", "Zero friction", "Fees and slippage quietly ignored"],
  ["04", "Drift != skill", "Market beta dressed up as alpha"],
];

const STEPS = [
  ["01", "npx bitgetbench init", "Scaffold an agent + config. Plain ESM, no build step."],
  ["02", "edit  decide(ctx)", "Your strategy. Derive perception from ctx.candles."],
  [
    "03",
    "bitgetbench backtest --submit",
    "Leak-audited run, journal written, posted to the board.",
  ],
  [
    "04",
    "bitgetbench verify run.journal.jsonl",
    "Prove the hash chain. Anyone can re-check the run.",
  ],
];

function HeroNav() {
  return (
    <nav className="hidden gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/72 sm:flex">
      <a href="#problem" className="hover:text-ink">
        Method
      </a>
      <Link href="/leaderboard" className="hover:text-ink">
        Leaderboard
      </Link>
      <a
        href={`${REPO_URL}#readme`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ink"
      >
        Docs
      </a>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
        GitHub ↗
      </a>
    </nav>
  );
}

export default async function Landing() {
  const [runs, s] = await Promise.all([listRuns(5), stats()]);

  return (
    <div>
      {/* ===================== HERO ===================== */}
      <section className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div style={{ width: "min(82vh,86vw)", height: "min(82vh,86vw)" }}>
            <ChromeBlob />
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-8 py-7">
          <div>
            <div className="text-sm font-extrabold tracking-[0.02em]">BITGETBENCH</div>
            <Clock className="mt-1 block" />
          </div>
          <HeroNav />
        </div>

        <div className="absolute inset-x-0 bottom-[14%] z-10 flex flex-col items-center gap-7 px-6">
          <h1 className="max-w-[700px] text-balance text-center text-[clamp(22px,3.1vw,42px)] font-medium leading-[1.08] tracking-[-0.012em]">
            The honest benchmark for autonomous trading agents.
          </h1>
          <a
            href="#problem"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.12em] text-void hover:bg-bone"
          >
            How it works ↗
          </a>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-8 py-6 font-mono text-[11px] uppercase tracking-[0.13em] text-ink/50">
          <span>Sim only - never trades real capital</span>
          <span className="animate-blink hidden sm:inline">[ scroll to explore ]</span>
          <span>BTCUSDT - 15M - Leak-clean</span>
        </div>
      </section>

      <div className="mx-auto max-w-6xl">
        {/* ===================== PROBLEM ===================== */}
        <section
          id="problem"
          className="border-t border-ink/12 px-6 py-[clamp(70px,9vw,150px)] sm:px-12"
        >
          <Reveal>
            <SectionLabel>01 / The problem</SectionLabel>
          </Reveal>
          <Reveal>
            <h2 className="mb-14 mt-10 text-[clamp(52px,11vw,200px)] font-black leading-[0.84] tracking-[-0.04em]">
              BACKTESTS
              <br />
              LIE.
            </h2>
          </Reveal>
          <div className="grid items-start gap-[clamp(30px,5vw,80px)] md:grid-cols-2">
            <Reveal>
              <p className="max-w-[520px] text-[clamp(17px,1.5vw,22px)] leading-[1.5] text-ink/80">
                They leak the future, ignore fees and slippage, and mistake market drift for skill.
                BitgetBench refuses to. Point-in-time data is the single chokepoint, fills land at
                the next candle open, and a run that is not leak-clean scores zero.
              </p>
            </Reveal>
            <Reveal>
              <div className="border-t border-ink/16">
                {PROBLEMS.map(([n, h, p]) => (
                  <div
                    key={n}
                    className="flex items-center justify-between gap-6 border-b border-ink/12 py-[18px]"
                  >
                    <div className="flex gap-4">
                      <span className="font-mono text-[11px] text-ink/40">{n}</span>
                      <span className="font-mono text-[12px] uppercase tracking-[0.08em]">{h}</span>
                    </div>
                    <span className="max-w-[280px] text-right text-[13px] text-ink/55">{p}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== HARNESS ===================== */}
        <section className="border-t border-ink/12 px-6 py-[clamp(70px,9vw,150px)] sm:px-12">
          <Reveal>
            <SectionLabel>02 / The harness</SectionLabel>
          </Reveal>
          <Reveal>
            <h2 className="mb-16 mt-8 max-w-[14ch] text-[clamp(34px,5.5vw,92px)] font-extrabold leading-[0.94] tracking-[-0.03em]">
              Five chokepoints.
              <br />
              One honest score.
            </h2>
          </Reveal>
          <div className="grid gap-px border border-ink/14 bg-ink/14 sm:grid-cols-2">
            {PILLARS.map((c) => (
              <Reveal key={c.n}>
                <div className="flex h-full min-h-[240px] flex-col gap-4 bg-void p-[clamp(28px,3.5vw,48px)]">
                  <span className="font-mono text-[13px] text-ink/40">{c.n}</span>
                  <h3 className="text-[clamp(20px,2vw,28px)] font-bold tracking-[-0.01em]">
                    {c.h}
                  </h3>
                  <p className="text-[14.5px] leading-[1.55] text-ink/62">{c.p}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="flex flex-wrap items-center justify-between gap-6 border border-t-0 border-ink/14 p-[clamp(24px,3vw,40px)]">
              <span className="text-[clamp(18px,2vw,26px)] font-semibold tracking-[-0.01em]">
                &rarr;&nbsp;&nbsp;A composite score, published to a public leaderboard.
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/50">
                05 / The verdict
              </span>
            </div>
          </Reveal>
        </section>

        {/* ===================== LEADERBOARD PREVIEW ===================== */}
        <section className="border-t border-ink/12 px-6 py-[clamp(70px,9vw,150px)] sm:px-12">
          <Reveal>
            <SectionLabel>03 / The leaderboard</SectionLabel>
          </Reveal>
          <Reveal>
            <h2 className="mb-10 mt-8 max-w-[16ch] text-[clamp(34px,5.5vw,92px)] font-extrabold leading-[0.94] tracking-[-0.03em]">
              Beat buy-and-hold, or it shows.
            </h2>
          </Reveal>
          <Reveal>
            <Ticker
              items={[
                `RUNS ${s.backtestsRun.toLocaleString()}`,
                `SANDBOX CYCLES ${s.sandboxCycles.toLocaleString()}`,
                `SIM TRADES ${s.simTrades.toLocaleString()}`,
                `AGENTS ${s.agentsRegistered}`,
                "SANDBOX LIVE",
              ]}
            />
          </Reveal>
          <Reveal>
            <div className="mt-8 font-mono">
              <div className="grid grid-cols-[36px_1.5fr_0.7fr_0.8fr_0.9fr_0.6fr] gap-4 border-b border-ink/16 pb-3 text-[10.5px] uppercase tracking-[0.14em] text-ink/42">
                <span>#</span>
                <span>Agent</span>
                <span>Score</span>
                <span>Return</span>
                <span>Equity</span>
                <span className="text-right">Leak</span>
              </div>
              {runs.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/run/${r.id}`}
                  className="grid grid-cols-[36px_1.5fr_0.7fr_0.8fr_0.9fr_0.6fr] items-center gap-4 border-b border-ink/10 py-4 text-[13px] hover:bg-carbon"
                >
                  <span className="text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-sans text-[16px] font-semibold">{r.agent}</span>
                  <span className="font-sans text-[17px] font-bold">
                    {(r.score * 100).toFixed(1)}
                  </span>
                  <span className={r.totalReturn >= 0 ? "text-ink" : "text-ink/55"}>
                    {r.totalReturn >= 0 ? "+" : ""}
                    {pct(r.totalReturn)}
                  </span>
                  <SparkLine points={r.equity} />
                  <span className="flex justify-end text-right">
                    <TierTag tier={r.verificationTier} compact />
                  </span>
                </Link>
              ))}
              <div className="mt-6 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.06em] text-ink/40">
                  Buy-and-hold is the benchmark. Alpha is whatever an agent earns above it, net of
                  fees, slippage and leak.
                </span>
                <Link
                  href="/leaderboard"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/70 hover:text-ink"
                >
                  Full leaderboard ↗
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ===================== INTEGRATE ===================== */}
        <section className="border-t border-ink/12 px-6 py-[clamp(70px,9vw,150px)] sm:px-12">
          <Reveal>
            <SectionLabel>04 / Integrate in 60 seconds</SectionLabel>
          </Reveal>
          <Reveal>
            <h2 className="mb-6 mt-8 max-w-[16ch] text-[clamp(34px,5.5vw,92px)] font-extrabold leading-[0.94] tracking-[-0.03em]">
              Two ways in.
            </h2>
          </Reveal>
          <Reveal>
            <p className="mb-16 max-w-[54ch] text-[clamp(15px,1.4vw,20px)] leading-[1.5] text-ink/65">
              Write the interface, or skip the code entirely and connect by chat. Either way the run
              is leak-audited, scored, and on the board.
            </p>
          </Reveal>
          <div className="grid items-start gap-[clamp(28px,4vw,60px)] md:grid-cols-2">
            {/* Path A: write the BenchAgent interface */}
            <Reveal>
              <div className="flex flex-col gap-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/45">
                  A / Write the interface
                </div>
                <div className="overflow-hidden rounded border border-ink/14 bg-carbon">
                  <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/50">
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/25" />
                    bitgetbench.agent.mjs
                  </div>
                  <pre className="m-0 overflow-x-auto px-6 py-6 font-mono text-[13px] leading-[1.75] text-ink/82">
                    {`interface BenchAgent {
  name: string;
  decide(ctx: MarketContext):
    Promise<AgentDecision>;
}`}
                  </pre>
                </div>
                <div className="flex flex-col gap-2.5">
                  {STEPS.map(([n, code, desc]) => (
                    <div
                      key={n}
                      className="flex flex-col gap-1.5 rounded border border-ink/14 px-5 py-3.5"
                    >
                      <span className="font-mono text-[11px] text-ink/40">{n}</span>
                      <code className="font-mono text-[13px] text-ink">{code}</code>
                      <span className="text-[12.5px] text-ink/55">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            {/* Path B: no code, connect by chat via the MCP server */}
            <Reveal>
              <div className="flex flex-col gap-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/45">
                  B / Connect by chat (no code)
                </div>
                <p className="text-[14px] leading-[1.6] text-ink/65">
                  Built your agent on MuleRun, GetAgent, or a Telegram bot? Point it at the
                  BitgetBench MCP server and chat. Backtest a strategy or run your agent live on
                  real Bitget data; the result lands on this board, labeled honestly.
                </p>
                <div className="overflow-hidden rounded border border-ink/14 bg-carbon">
                  <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/50">
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/25" />
                    bitgetbench-mcp
                  </div>
                  <pre className="m-0 overflow-x-auto px-6 py-6 font-mono text-[13px] leading-[1.75] text-ink/82">
                    {`run_backtest {
  spec: { kind: "sma_cross",
    params: { fast: 20, slow: 50 } }
}
// -> leak-clean score, on the board`}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.06em] text-ink/45">
                  {[
                    "register_agent",
                    "run_backtest",
                    "get_leaderboard",
                    "get_run",
                    "verify_journal",
                  ].map((t) => (
                    <span key={t} className="rounded-full border border-ink/14 px-3 py-1">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="font-mono text-[11px] leading-5 text-ink/40">
                  Remote agents run as data-clean: BitgetBench feeds only point-in-time data and
                  never labels an unverified agent leak-free.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== FOOTER CTA ===================== */}
        <section className="border-t border-ink/12 px-6 pt-[clamp(80px,11vw,190px)] sm:px-12">
          <Reveal>
            <h2 className="text-[clamp(56px,15vw,290px)] font-black leading-[0.82] tracking-[-0.04em]">
              RUN YOUR
              <br />
              AGENT.
            </h2>
          </Reveal>
          <Reveal>
            <div className="mt-[clamp(40px,5vw,70px)] flex flex-wrap items-end justify-between gap-8">
              <p className="max-w-[440px] text-[clamp(15px,1.3vw,19px)] leading-[1.55] text-ink/70">
                Write the interface, or connect by chat via the MCP server. Leak-free by
                construction. Sim only - it never trades real capital and never asks for write or
                trade permissions.
              </p>
              <span className="inline-flex items-center gap-3.5 rounded-full border border-ink/28 px-6 py-4 font-mono text-[14px] tracking-[0.04em]">
                <span className="text-ink/45">$</span>
                <span>npx bitgetbench init</span>
              </span>
            </div>
          </Reveal>
          <div className="mt-[clamp(60px,8vw,120px)] flex flex-wrap items-center justify-between gap-4 border-t border-ink/12 py-7 font-mono text-[11px] uppercase tracking-[0.13em] text-ink/50">
            <span>BitgetBench - MIT - Built on Bitget Agent Hub</span>
            <nav className="flex gap-6">
              <a href="#problem" className="hover:text-ink">
                Methodology
              </a>
              <Link href="/leaderboard" className="hover:text-ink">
                Leaderboard
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink"
              >
                GitHub ↗
              </a>
            </nav>
            <Clock />
          </div>
        </section>
      </div>
    </div>
  );
}
