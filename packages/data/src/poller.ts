// Live candle poller for the paper-sandbox (Phase 3). On each timeframe boundary it
// fetches the just-closed candle and appends it to the cache, which is immutable once
// closed. Interface only for now; the cron-driven implementation lands in Phase 3.

import type { Candle } from "@bitgetbench/core";

export interface LivePoller {
  /** Fetch the latest fully closed candle for the symbol/timeframe, or null if none. */
  pollLatestClosed(symbol: string, timeframe: string): Promise<Candle | null>;
}
