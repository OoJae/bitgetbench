// Bitget candle fetcher. This file isolates the ONE thing that is time-sensitive and
// must be verified against the live Bitget docs before any fetched dataset is trusted:
// the endpoint paths, the param shape, and the per-call row cap. Everything uncertain
// lives in BITGET_CONFIG below. See CLAUDE.md "Facts to verify live".
//
// v1 targets USDT-M futures (productType USDT-FUTURES). Public candle data needs no auth.

import type { Candle } from "@bitgetbench/core";
import { toBitgetGranularity } from "./timeframe.js";

export interface BitgetConfig {
  /** REST base, override via BITGET_REST_BASE. */
  baseUrl: string;
  /** Ranged historical candles, paged backward via endTime. */
  historyCandlesPath: string;
  /** USDT-M futures product type. */
  productType: string;
  /** Max rows the history endpoint returns per call (verify against live docs). */
  maxLimit: number;
  /** Polite delay between paged calls, milliseconds. */
  pageDelayMs: number;
  /** Retry attempts on transient failure. */
  maxRetries: number;
}

// BEST-KNOWN values, NOT yet verified against live Bitget docs (hard rule 7).
// Confirm: historyCandlesPath, maxLimit, history depth, and that the response row is
// [openTime, open, high, low, close, baseVol, quoteVol].
export const BITGET_CONFIG: BitgetConfig = {
  baseUrl: process.env.BITGET_REST_BASE ?? "https://api.bitget.com",
  historyCandlesPath: "/api/v2/mix/market/history-candles",
  productType: "USDT-FUTURES",
  maxLimit: 200,
  pageDelayMs: 120,
  maxRetries: 5,
};

export interface FetchRangeParams {
  symbol: string;
  timeframe: string;
  /** Inclusive window start, epoch ms. */
  startMs: number;
  /** Exclusive window end, epoch ms. */
  endMs: number;
  config?: Partial<BitgetConfig>;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Counts every network call made, for telemetry. */
  onRequest?: () => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface BitgetResponse {
  code: string;
  msg: string;
  data: unknown;
}

/** Parse one raw Bitget candle row ([ts, o, h, l, c, vol, ...]) into a Candle. */
function parseRow(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const openTime = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  if (![openTime, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { openTime, open, high, low, close, volume };
}

/**
 * Fetch every closed candle with openTime in [startMs, endMs), paging backward from
 * endMs. Dedupes by openTime, sorts ascending. Retries transient failures with backoff.
 */
export async function fetchCandleRange(params: FetchRangeParams): Promise<Candle[]> {
  const cfg: BitgetConfig = { ...BITGET_CONFIG, ...params.config };
  const fetchImpl = params.fetchImpl ?? fetch;
  const sleep = params.sleepImpl ?? defaultSleep;
  const granularity = toBitgetGranularity(params.timeframe);

  const byOpenTime = new Map<number, Candle>();
  // Cursor is the exclusive upper bound for the next page (we walk older over time).
  let cursor = params.endMs;
  let guard = 0;
  // Hard cap on pages so a misbehaving endpoint can never loop forever.
  const maxPages = Math.ceil((params.endMs - params.startMs) / 1) + 10_000;

  while (cursor > params.startMs && guard < maxPages) {
    guard += 1;
    const url = buildHistoryUrl(cfg, params.symbol, granularity, cursor);
    const rows = await requestPage(url, cfg, fetchImpl, sleep, params.onRequest);

    if (rows.length === 0) break;

    let minOpenTime = Number.POSITIVE_INFINITY;
    let added = 0;
    for (const raw of rows) {
      const candle = parseRow(raw);
      if (!candle) continue;
      if (candle.openTime < minOpenTime) minOpenTime = candle.openTime;
      if (candle.openTime >= params.startMs && candle.openTime < params.endMs) {
        if (!byOpenTime.has(candle.openTime)) added += 1;
        byOpenTime.set(candle.openTime, candle);
      }
    }

    // No usable rows or no backward progress: stop to avoid an infinite loop.
    if (!Number.isFinite(minOpenTime) || minOpenTime >= cursor) break;
    cursor = minOpenTime;
    if (added === 0 && minOpenTime < params.startMs) break;

    await sleep(cfg.pageDelayMs);
  }

  return [...byOpenTime.values()].sort((a, b) => a.openTime - b.openTime);
}

function buildHistoryUrl(
  cfg: BitgetConfig,
  symbol: string,
  granularity: string,
  endTime: number,
): string {
  const u = new URL(cfg.historyCandlesPath, cfg.baseUrl);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("productType", cfg.productType);
  u.searchParams.set("granularity", granularity);
  u.searchParams.set("endTime", String(endTime));
  u.searchParams.set("limit", String(cfg.maxLimit));
  return u.toString();
}

async function requestPage(
  url: string,
  cfg: BitgetConfig,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  onRequest?: () => void,
): Promise<unknown[]> {
  let attempt = 0;
  // Exponential backoff on transient HTTP / API errors.
  for (;;) {
    attempt += 1;
    onRequest?.();
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        if (attempt > cfg.maxRetries) {
          throw new Error(`Bitget HTTP ${res.status} after ${cfg.maxRetries} retries: ${url}`);
        }
        await sleep(backoffMs(attempt, cfg.pageDelayMs));
        continue;
      }
      const body = (await res.json()) as BitgetResponse;
      if (body.code !== "00000") {
        if (attempt > cfg.maxRetries) {
          throw new Error(`Bitget API code ${body.code} (${body.msg}) after retries: ${url}`);
        }
        await sleep(backoffMs(attempt, cfg.pageDelayMs));
        continue;
      }
      return Array.isArray(body.data) ? body.data : [];
    } catch (err) {
      if (attempt > cfg.maxRetries) throw err;
      await sleep(backoffMs(attempt, cfg.pageDelayMs));
    }
  }
}

function backoffMs(attempt: number, base: number): number {
  return base * 2 ** (attempt - 1);
}
