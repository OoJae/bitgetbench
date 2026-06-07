// Milestone 0 smoke test. Fetches 6 months of BTCUSDT 15m USDT-M futures candles from
// Bitget, caches them, and proves: (1) the cache round-trips deterministically (re-
// serializing the reloaded candles reproduces the manifest sha256), (2) a second write
// of the same candles is idempotent, and (3) the point-in-time reader never returns a
// candle with openTime > the query timestamp.
//
// Run: pnpm --filter @bitgetbench/data fetch:smoke
// Requires network. Public Bitget candle data needs no auth.

import {
  fetchAndCacheRange,
  readCachedCandles,
  readManifest,
  toNdjson,
  sha256,
  findGaps,
  readerFromCache,
  countUpTo,
  timeframeToMs,
  DEFAULT_MARKET,
  type CacheKey,
} from "../src/index.js";

const SYMBOL = "BTCUSDT";
const TIMEFRAME = "15m";
const DAYS = 180;

function fmt(ts: number): string {
  return new Date(ts).toISOString();
}

async function main(): Promise<void> {
  const step = timeframeToMs(TIMEFRAME);
  // Align the window to the bar grid and stop at the last fully closed bar.
  const endMs = Math.floor(Date.now() / step) * step;
  const startMs = endMs - DAYS * 24 * 60 * 60 * 1000;
  const expectedBars = Math.round((endMs - startMs) / step);

  let requestCount = 0;
  console.log(`Fetching ${SYMBOL} ${TIMEFRAME} ${DEFAULT_MARKET} from Bitget`);
  console.log(`  window: ${fmt(startMs)} -> ${fmt(endMs)} (${DAYS} days)`);
  console.log(`  expected bars: ~${expectedBars}`);
  console.log("");

  const t0 = Date.now();
  const manifest = await fetchAndCacheRange({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startMs,
    endMs,
    onRequest: () => {
      requestCount += 1;
    },
  });
  const fetchSecs = ((Date.now() - t0) / 1000).toFixed(1);

  const key: CacheKey = { market: DEFAULT_MARKET, symbol: SYMBOL, timeframe: TIMEFRAME };
  const candles = readCachedCandles(key);
  const gaps = findGaps(candles, TIMEFRAME);
  const missingBars = gaps.reduce((sum, g) => sum + g.missingBars, 0);

  console.log("Cached-data summary");
  console.log(`  rows:            ${manifest.rows}`);
  console.log(
    `  coverage:        ${fmt(manifest.firstOpenTime!)} -> ${fmt(manifest.lastOpenTime!)}`,
  );
  console.log(`  sha256:          ${manifest.sha256}`);
  console.log(`  gaps:            ${gaps.length} (missing ${missingBars} bars)`);
  console.log(`  network calls:   ${requestCount}`);
  console.log(`  fetch time:      ${fetchSecs}s`);
  console.log("");

  // (1) Deterministic round-trip: reload + re-serialize must reproduce the manifest hash.
  const roundTripHash = sha256(toNdjson(candles));
  const roundTripOk = roundTripHash === manifest.sha256;

  // (2) Idempotent re-write: writing the same candles again must not change the hash.
  const manifest2 = await fetchAndCacheRange({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startMs,
    endMs,
    // Re-use the already-cached candles instead of hitting the network again.
    fetchImpl: async () =>
      new Response(JSON.stringify({ code: "00000", msg: "success", data: [] }), {
        headers: { "content-type": "application/json" },
      }),
  });
  const idempotentOk = manifest2.sha256 === manifest.sha256 && manifest2.rows === manifest.rows;

  const reloadedManifest = readManifest(key);
  const manifestPersistedOk = reloadedManifest?.sha256 === manifest.sha256;

  console.log("Determinism checks");
  console.log(`  round-trip serialize reproduces sha256:  ${roundTripOk ? "PASS" : "FAIL"}`);
  console.log(`  second write is idempotent:              ${idempotentOk ? "PASS" : "FAIL"}`);
  console.log(
    `  manifest persisted to disk:              ${manifestPersistedOk ? "PASS" : "FAIL"}`,
  );
  console.log("");

  // (3) Point-in-time leak check: sample timestamps across the window and assert the
  // reader never returns a future candle and always returns the correct maximal prefix.
  const reader = readerFromCache(key);
  let leakViolations = 0;
  let prefixMismatches = 0;
  const samples = 500;
  for (let i = 0; i < samples; i += 1) {
    const ts = startMs + Math.floor(((endMs - startMs) * i) / samples);
    const out = reader.getCandlesUpTo(SYMBOL, TIMEFRAME, ts);
    if (out.length > 0 && out[out.length - 1]!.openTime > ts) leakViolations += 1;
    if (out.length !== countUpTo(candles, ts)) prefixMismatches += 1;
  }

  console.log("Point-in-time reader checks");
  console.log(`  samples:                 ${samples}`);
  console.log(`  future-candle leaks:     ${leakViolations}`);
  console.log(`  prefix mismatches:       ${prefixMismatches}`);
  console.log("");

  const coverageOk = manifest.rows >= expectedBars * 0.95;
  const allPass =
    roundTripOk &&
    idempotentOk &&
    manifestPersistedOk &&
    leakViolations === 0 &&
    prefixMismatches === 0 &&
    coverageOk;

  if (!coverageOk) {
    console.log(`Warning: got ${manifest.rows} rows, expected ~${expectedBars} (>= 95%).`);
  }
  console.log(allPass ? "SMOKE: PASS" : "SMOKE: FAIL");
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("SMOKE: FAIL (error)");
  console.error(err);
  process.exitCode = 1;
});
