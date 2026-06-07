// Timeframe helpers. Canonical timeframes are lowercase ("15m", "1h", "1d"). Bitget's
// granularity strings differ in case for hours and up, so we map explicitly.

/** Canonical timeframe to bar length in milliseconds. */
const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Canonical timeframe to the granularity string Bitget's v2 candle API expects. */
const BITGET_GRANULARITY: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
};

export function timeframeToMs(timeframe: string): number {
  const ms = TIMEFRAME_MS[timeframe];
  if (ms === undefined) {
    throw new Error(`Unsupported timeframe "${timeframe}". Supported: ${supportedTimeframes()}`);
  }
  return ms;
}

export function toBitgetGranularity(timeframe: string): string {
  const g = BITGET_GRANULARITY[timeframe];
  if (g === undefined) {
    throw new Error(`Unsupported timeframe "${timeframe}". Supported: ${supportedTimeframes()}`);
  }
  return g;
}

export function supportedTimeframes(): string {
  return Object.keys(TIMEFRAME_MS).join(", ");
}

/** Floor a timestamp down to the start of its bar on the timeframe grid. */
export function alignDown(ts: number, timeframe: string): number {
  const ms = timeframeToMs(timeframe);
  return Math.floor(ts / ms) * ms;
}
