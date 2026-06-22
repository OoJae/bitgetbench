// @bitgetbench/api: the public write API (register agents, run spec + remote backtests) plus a
// read mirror, as a framework-free node:http service. The MCP server is a thin client of this.
export { createApp, createServer, type ServerDeps } from "./server.js";
export { JobQueue } from "./jobs.js";
export { RateLimiter } from "./rateLimit.js";
export {
  runSpecBacktest,
  runRemoteBacktest,
  runRemoteSandboxPass,
  NoMarketDataError,
  type BacktestResult,
  type RemoteSandboxOutcome,
} from "./backtest.js";
