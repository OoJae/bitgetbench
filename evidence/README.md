# BitgetBench evidence bundle

Verifiable usage records for the Bitget AI Base Camp Hackathon (Trading Infra). Everything here
is reproducible from the public repo and the live site. Sim only, read-only market data.

- Live site: https://bitgetbench.vercel.app
- Leaderboard: https://bitgetbench.vercel.app/leaderboard
- Live telemetry: https://bitgetbench.vercel.app/api/stats

## Files

| File                            | What it proves                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `telemetry.json`                | Live `/api/stats` snapshot: agents registered, backtests run, sandbox cycles, sim trades, distinct users, and the latest sandbox heartbeat. Real cumulative usage.                                                                                                          |
| `leaderboard.json`              | Live `/api/runs` snapshot: every ranked run with its leak status, verification tier (`engine-verified` vs `data-clean`), composite score, return, Sharpe, max drawdown, and journal root.                                                                                   |
| `sample-backtest.result.json`   | A full `RunResult` from a reproducible 500-bar BTCUSDT 15m backtest of the SMA 20/50 reference agent: metrics, buy-and-hold benchmark, alpha/beta decomposition, leak certificate (`clean: true`, `scope: engine`), journal root, score, and tier.                          |
| `sample-backtest.journal.jsonl` | The hash-chained, tamper-evident journal for that run (500 entries, one per step).                                                                                                                                                                                          |
| `verify.txt`                    | `bitgetbench verify` output proving the journal chain is intact (`ok: true`, 500 checked), then the same after tampering one entry (`ok: false`, `brokenAt: 250`). Tamper-evidence, demonstrated.                                                                           |
| `api-mcp-sample-io.json`        | Real request/response for the no-code path: `run_backtest` (strategy spec, returns an `engine-verified` result), `register_agent` (remote webhook), `run_backtest` (remote, queued job), the job poll, the resulting `data-clean` run, and `/api/stats`. API keys redacted. |
| `sandbox-cron-sample.log`       | One complete cycle of the unattended 15-minute sandbox cron (paths and IPs sanitized): candles synced and the five reference agents re-run.                                                                                                                                 |

## How to reproduce / verify

```bash
# 1. Clone + build
git clone https://github.com/OoJae/bitgetbench && cd bitgetbench
pnpm install && pnpm -r build

# 2. Fetch the same market data, run a backtest, get a journal + result
pnpm --filter @bitgetbench/data fetch:smoke
npx bitgetbench init                                  # scaffolds an agent + config
bitgetbench backtest --config bitgetbench.config.json --journal run.journal.jsonl --submit

# 3. Verify the journal chain (then edit any line and re-run to watch it break)
bitgetbench verify run.journal.jsonl                  # ok: true

# 4. No-code path: run a strategy-spec or remote-webhook backtest over the HTTP API / MCP server
#    (see the repo README "Remote and no-code agents" section)
```

The composite score, leak certificate, and journal root are deterministic: the same inputs
reproduce the same outputs, so any run in `leaderboard.json` can be re-checked independently.
