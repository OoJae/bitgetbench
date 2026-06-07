// @bitgetbench/adapters: helpers for building BenchAgents on the Bitget Agent Hub.
// - indicators: point-in-time technical features safe for leak-free backtests
// - BitgetHubClient: live bgc market-data perception for the paper-sandbox (read-only)
export {
  sma,
  ema,
  emaSeries,
  rsi,
  macd,
  atr,
  momentum,
  technicalFeatures,
  type Macd,
  type TechnicalSnapshot,
} from "./indicators.js";

export { BitgetHubClient, type BgcResult, type BitgetHubClientOptions } from "./bitgetHub.js";
