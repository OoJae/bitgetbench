// Milestone 1 + 2 backtest smoke. Runs buy-and-hold and SMA-crossover through the engine on
// the cached 6-month BTCUSDT 15m data and proves: (1) buy-and-hold reconciles to asset
// return minus the taker fee, (2) the engine is deterministic, (3) the SMA run produces a
// clean leak certificate, a benchmarked RunResult (decomposition + composite score), and a
// hash-chained journal that verifies and breaks under tampering.
//
// Run: pnpm --filter @bitgetbench/reference-agents backtest:smoke
// Requires the Milestone 0 cache (pnpm --filter @bitgetbench/data fetch:smoke).

import {
  runBacktest,
  runBenchmarked,
  verifyJournal,
  DEFAULT_TAKER_FEE,
  type BacktestRun,
  type Metrics,
  type JournalEntry,
} from "@bitgetbench/core";
import {
  readerFromCache,
  readManifest,
  readCachedCandles,
  DEFAULT_MARKET,
  type CacheKey,
} from "@bitgetbench/data";
import { BuyAndHoldAgent, SmaCrossoverAgent } from "../src/index.js";

const KEY: CacheKey = { market: DEFAULT_MARKET, symbol: "BTCUSDT", timeframe: "15m" };
const START_EQUITY = 10_000;

function fmtMetric(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "inf" : "-inf";
  return v.toFixed(4);
}

function printMetrics(label: string, run: BacktestRun): void {
  const m: Metrics = run.metrics;
  console.log(`\n${label}  (${run.agent})`);
  console.log(`  end equity:     ${run.endEquity.toFixed(2)} USDT`);
  console.log(`  total return:   ${(m.totalReturn * 100).toFixed(2)}%`);
  console.log(`  sharpe:         ${fmtMetric(m.sharpe)}`);
  console.log(`  max drawdown:   ${(m.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  win rate:       ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`  trades:         ${m.trades}`);
  console.log(`  exposure:       ${(m.exposure * 100).toFixed(1)}%`);
  console.log(
    `  leak clean:     ${run.leakCertificate.clean} (violations ${run.leakCertificate.violations})`,
  );
}

async function main(): Promise<void> {
  const manifest = readManifest(KEY);
  if (!manifest || manifest.firstOpenTime === null || manifest.lastOpenTime === null) {
    console.error("No cached data. Run: pnpm --filter @bitgetbench/data fetch:smoke");
    process.exitCode = 1;
    return;
  }
  const startTs = manifest.firstOpenTime;
  const endTs = manifest.lastOpenTime;
  const reader = readerFromCache(KEY);

  console.log(`BitgetBench backtest smoke`);
  console.log(`  symbol:     ${KEY.symbol} ${KEY.timeframe} ${KEY.market}`);
  console.log(
    `  window:     ${new Date(startTs).toISOString()} -> ${new Date(endTs).toISOString()}`,
  );
  console.log(`  bars:       ${manifest.rows}`);
  console.log(`  taker fee:  ${(DEFAULT_TAKER_FEE * 100).toFixed(3)}%`);

  const common = { reader, symbol: KEY.symbol, timeframe: KEY.timeframe, startTs, endTs };

  const bhConfig = {
    startEquity: START_EQUITY,
    fees: { takerFee: DEFAULT_TAKER_FEE },
    slippage: { bps: 0 },
    contextLookback: 8,
  };
  const buyHold = await runBacktest({ ...common, agent: new BuyAndHoldAgent(), config: bhConfig });
  printMetrics("Buy and hold", buyHold);

  // SMA via the full benchmarked pipeline: decomposition, score, journal.
  const { result, agentRun } = await runBenchmarked({
    ...common,
    agent: new SmaCrossoverAgent({ fast: 20, slow: 50 }),
    config: {
      startEquity: START_EQUITY,
      fees: { takerFee: DEFAULT_TAKER_FEE },
      slippage: { bps: 1 },
      contextLookback: 200,
    },
  });
  printMetrics("SMA crossover 20/50", agentRun);
  console.log(`\nSMA benchmarked RunResult`);
  console.log(`  composite score:   ${result.score.toFixed(4)}`);
  console.log(`  alpha (per step):  ${result.decomposition.alpha.toExponential(3)}`);
  console.log(`  beta vs benchmark: ${result.decomposition.beta.toFixed(4)}`);
  console.log(`  market return:     ${(result.decomposition.marketReturn * 100).toFixed(2)}%`);
  console.log(`  skill return:      ${(result.decomposition.skillReturn * 100).toFixed(2)}%`);
  console.log(`  benchmark return:  ${(result.benchmark.totalReturn * 100).toFixed(2)}%`);
  console.log(`  journal root:      ${result.journalRoot}`);
  console.log(`  journal entries:   ${agentRun.journal.length}`);

  // (1) Reconciliation: buy-and-hold totalReturn == assetReturn - takerFee.
  const candles = readCachedCandles(KEY).filter(
    (c) => c.openTime >= startTs && c.openTime <= endTs,
  );
  const entry = candles[1]!.open;
  const finalClose = candles[candles.length - 1]!.close;
  const expected = finalClose / entry - 1 - DEFAULT_TAKER_FEE;
  const recDiff = Math.abs(buyHold.metrics.totalReturn - expected);
  const recOk = recDiff < 1e-9;

  // (2) Determinism.
  const buyHold2 = await runBacktest({ ...common, agent: new BuyAndHoldAgent(), config: bhConfig });
  const detOk = JSON.stringify(buyHold.equityCurve) === JSON.stringify(buyHold2.equityCurve);

  // (3) Leak-free + journal verify, and a tamper that breaks the chain.
  const leakOk = agentRun.leakCertificate.clean && agentRun.leakCertificate.violations === 0;
  const verifyOk = verifyJournal(agentRun.journal).ok;
  const tampered: JournalEntry[] = agentRun.journal.map((e) => ({ ...e }));
  const mid = Math.floor(tampered.length / 2);
  tampered[mid] = { ...tampered[mid]!, equityAfter: tampered[mid]!.equityAfter + 1 };
  const tamperCaught = !verifyJournal(tampered).ok;

  console.log(`\nChecks`);
  console.log(
    `  buy-and-hold reconciles (< 1e-9):    ${recOk ? "PASS" : "FAIL"} (diff ${recDiff.toExponential(2)})`,
  );
  console.log(`  determinism (identical curves):      ${detOk ? "PASS" : "FAIL"}`);
  console.log(`  SMA leak certificate clean:          ${leakOk ? "PASS" : "FAIL"}`);
  console.log(`  journal verifies:                    ${verifyOk ? "PASS" : "FAIL"}`);
  console.log(`  tamper is caught:                    ${tamperCaught ? "PASS" : "FAIL"}`);

  const allPass = recOk && detOk && leakOk && verifyOk && tamperCaught;
  console.log(`\n${allPass ? "SMOKE: PASS" : "SMOKE: FAIL"}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("SMOKE: FAIL (error)");
  console.error(err);
  process.exitCode = 1;
});
