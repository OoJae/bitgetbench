// Milestone 1 smoke. Runs buy-and-hold and SMA-crossover through the engine on the cached
// 6-month BTCUSDT 15m data and proves: (1) buy-and-hold reconciles to asset return minus
// the taker fee, and (2) the engine is deterministic (two runs give identical equity
// curves). Prints both metrics tables.
//
// Run: pnpm --filter @bitgetbench/reference-agents backtest:smoke
// Requires the Milestone 0 cache (pnpm --filter @bitgetbench/data fetch:smoke).

import { runBacktest, DEFAULT_TAKER_FEE, type BacktestRun, type Metrics } from "@bitgetbench/core";
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
  console.log(`  CAGR:           ${(m.cagr * 100).toFixed(2)}%`);
  console.log(`  sharpe:         ${fmtMetric(m.sharpe)}`);
  console.log(`  sortino:        ${fmtMetric(m.sortino)}`);
  console.log(`  max drawdown:   ${(m.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  calmar:         ${fmtMetric(m.calmar)}`);
  console.log(`  volatility:     ${fmtMetric(m.volatility)}`);
  console.log(`  win rate:       ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`  profit factor:  ${fmtMetric(m.profitFactor)}`);
  console.log(`  expectancy:     ${m.expectancy.toFixed(2)} USDT`);
  console.log(`  trades:         ${m.trades}`);
  console.log(`  exposure:       ${(m.exposure * 100).toFixed(1)}%`);
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

  console.log(`BitgetBench Milestone 1 backtest smoke`);
  console.log(`  symbol:     ${KEY.symbol} ${KEY.timeframe} ${KEY.market}`);
  console.log(
    `  window:     ${new Date(startTs).toISOString()} -> ${new Date(endTs).toISOString()}`,
  );
  console.log(`  bars:       ${manifest.rows}`);
  console.log(`  equity:     ${START_EQUITY} USDT`);
  console.log(`  taker fee:  ${(DEFAULT_TAKER_FEE * 100).toFixed(3)}%`);

  const common = {
    reader,
    symbol: KEY.symbol,
    timeframe: KEY.timeframe,
    startTs,
    endTs,
  };

  // Buy-and-hold with zero slippage so it reconciles exactly to asset return minus fee.
  const bhConfig = {
    startEquity: START_EQUITY,
    fees: { takerFee: DEFAULT_TAKER_FEE },
    slippage: { bps: 0 },
    contextLookback: 8,
  };
  const buyHold = await runBacktest({ ...common, agent: new BuyAndHoldAgent(), config: bhConfig });
  printMetrics("Buy and hold", buyHold);

  // SMA-crossover, long/flat, with a small realistic slippage.
  const sma = await runBacktest({
    ...common,
    agent: new SmaCrossoverAgent({ fast: 20, slow: 50 }),
    config: {
      startEquity: START_EQUITY,
      fees: { takerFee: DEFAULT_TAKER_FEE },
      slippage: { bps: 1 },
      contextLookback: 200,
    },
  });
  printMetrics("SMA crossover 20/50", sma);

  // (1) Reconciliation: buy-and-hold totalReturn == assetReturn - takerFee.
  const candles = readCachedCandles(KEY).filter(
    (c) => c.openTime >= startTs && c.openTime <= endTs,
  );
  const entry = candles[1]!.open; // first fill is at the second bar's open
  const finalClose = candles[candles.length - 1]!.close;
  const assetReturn = finalClose / entry - 1;
  const expected = assetReturn - DEFAULT_TAKER_FEE;
  const recDiff = Math.abs(buyHold.metrics.totalReturn - expected);
  const recOk = recDiff < 1e-9;

  console.log(`\nBuy-and-hold reconciliation`);
  console.log(`  asset return (entry open -> final close): ${(assetReturn * 100).toFixed(4)}%`);
  console.log(`  expected (asset return - taker fee):      ${(expected * 100).toFixed(4)}%`);
  console.log(
    `  actual total return:                      ${(buyHold.metrics.totalReturn * 100).toFixed(4)}%`,
  );
  console.log(`  abs diff:                                 ${recDiff.toExponential(2)}`);
  console.log(`  reconciles (< 1e-9):                      ${recOk ? "PASS" : "FAIL"}`);

  // (2) Determinism: a second identical run yields an identical equity curve.
  const buyHold2 = await runBacktest({ ...common, agent: new BuyAndHoldAgent(), config: bhConfig });
  const detOk =
    JSON.stringify(buyHold.equityCurve) === JSON.stringify(buyHold2.equityCurve) &&
    buyHold.endEquity === buyHold2.endEquity;
  console.log(`\nDeterminism`);
  console.log(`  two runs produce identical equity curves: ${detOk ? "PASS" : "FAIL"}`);

  const allPass = recOk && detOk;
  console.log(`\n${allPass ? "SMOKE: PASS" : "SMOKE: FAIL"}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("SMOKE: FAIL (error)");
  console.error(err);
  process.exitCode = 1;
});
