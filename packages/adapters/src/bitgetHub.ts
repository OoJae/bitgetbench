// Thin wrapper over the Bitget Agent Hub CLI (`bgc`, from the bitget-client package) for
// LIVE market-data perception. Read-only by construction: this wrapper exposes only query
// methods and never write/trade commands (hard rule 3). It is for the live paper-sandbox;
// leak-free backtests use point-in-time indicators (see indicators.ts), not live data.
//
// Install the CLI with: npx bitget-hub upgrade-all --target claude

import { execFile } from "node:child_process";

export interface BgcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BitgetHubClientOptions {
  /** Binary name or path. Default "bgc". */
  bin?: string;
  /** Per-call timeout in ms. Default 15000. */
  timeoutMs?: number;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<BgcResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        const reason = code === "ENOENT" ? "bgc not installed" : (stderr || err.message).trim();
        resolve({ ok: false, error: reason });
        return;
      }
      try {
        resolve({ ok: true, data: JSON.parse(stdout) });
      } catch {
        // Some commands print plain text; surface it raw.
        resolve({ ok: true, data: stdout.trim() });
      }
    });
  });
}

/**
 * Live market-data perception via `bgc`. Use only in the live sandbox. Every method is a
 * read; nothing here can place or cancel an order.
 */
export class BitgetHubClient {
  private readonly bin: string;
  private readonly timeoutMs: number;

  constructor(opts: BitgetHubClientOptions = {}) {
    this.bin = opts.bin ?? "bgc";
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /** True if the bgc CLI is installed and responding. */
  async available(): Promise<boolean> {
    const res = await run(this.bin, ["--help"], this.timeoutMs);
    return res.ok;
  }

  /** Spot ticker for a symbol, e.g. getSpotTicker("BTCUSDT"). */
  async getSpotTicker(symbol: string): Promise<BgcResult> {
    return run(this.bin, ["spot", "spot_get_ticker", "--symbol", symbol], this.timeoutMs);
  }

  /** Escape hatch for any read-only bgc command, e.g. raw(["futures", "..."]). */
  async raw(args: string[]): Promise<BgcResult> {
    return run(this.bin, args, this.timeoutMs);
  }
}
