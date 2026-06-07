---
name: bitgetbench-integrate
description: Integrate a Bitget Agent Hub trading agent with BitgetBench. Use when the user wants to benchmark, backtest, leak-audit, guardrail, or paper-trade an agent, or asks to "run my agent through BitgetBench". Scaffolds a BenchAgent adapter, runs a leak-free backtest, and verifies the journal.
---

# Integrate an agent with BitgetBench

BitgetBench runs any agent through a leak-free backtester and a live paper-trading sandbox on real Bitget market data, enforces risk guardrails on every decision, and records a tamper-evident journal. The whole integration surface is one interface, `BenchAgent`.

## The contract

```ts
interface BenchAgent {
  name: string;
  decide(ctx: MarketContext): Promise<AgentDecision>;
}
```

- `ctx.candles` are point-in-time: every `candle.openTime <= ctx.timestamp`. There is no look-ahead.
- `ctx.position` is the current sim position (or null); `ctx.equity` is current equity.
- Return `{ action: "long" | "short" | "close" | "hold", symbol, sizePct (0..1), leverage?, rationale, confidence? }`. The rationale is recorded verbatim in the journal.

## Steps

1. Scaffold the adapter and config:

   ```bash
   bitgetbench init
   ```

   This writes `bitgetbench.agent.mjs` (a starter SMA agent), `bitgetbench.config.json`, and `BITGETBENCH.md`.

2. Implement `decide(ctx)` in `bitgetbench.agent.mjs`. For perception, derive features from `ctx.candles` (point-in-time, safe for backtests). The `@bitgetbench/adapters` package provides `technicalFeatures(candles)` (SMA, EMA, RSI, MACD, ATR, momentum) and a `BitgetHubClient` (`bgc`) for live market data in the sandbox.

3. Run a leak-audited, benchmarked backtest (writes the journal):

   ```bash
   bitgetbench backtest --config bitgetbench.config.json --journal run.journal.jsonl
   ```

   The JSON output includes full metrics, a buy-and-hold benchmark, an alpha/beta decomposition, a `leakCertificate`, a `journalRoot`, and the composite score.

4. Verify the journal's integrity:

   ```bash
   bitgetbench verify run.journal.jsonl
   ```

## Rules that keep results trustworthy

- Point-in-time only: never read data after `ctx.timestamp`. The harness enforces this and emits a `LeakCertificate`; a run that is not leak-clean scores 0.
- Live Agent Hub analyst skills (sentiment, macro, news) are live-only and must not be used in backtests, because they cannot be replayed point-in-time. Use them in the live sandbox only.
- Sim only: BitgetBench never trades real capital and never needs write/trade API permissions. Use read-only Bitget keys; public candle data needs no auth.
