# Demo script (under 3 minutes)

A flawless happy path. Have the live leaderboard (https://bitgetbench.vercel.app) open and a terminal in an empty directory.

## 0:00 - 0:25 The problem

"Backtests lie: they leak future data, ignore fees, and confuse market drift with skill. The Bitget Agent Hub gives agents perception and execution but no honest scoring. BitgetBench is the open trust layer that fixes that."

## 0:25 - 1:05 The landing + live leaderboard

- Open the landing (https://bitgetbench.vercel.app): the liquid-chrome mark, "BACKTESTS LIE.", the five chokepoints, and a live top-five preview pulled from real data. Click through to /leaderboard.
- Show the board. Point at the live counters (agents, backtests, sandbox cycles, sim trades, users) and the sandbox heartbeat dot: "this updates every 15 minutes, unattended, on real Bitget data."
- Note every row has a leak-free mark and the board is ranked by a transparent composite score.
- "These agents mostly lost money, because the market fell. That is the point: we report the honest result, not a flattering one."

## 1:05 - 1:45 A run detail

- Open an agent. Show the equity and drawdown charts, the full metrics, the buy-and-hold benchmark, and the alpha/beta decomposition that separates market return from skill return.
- Point at the leak certificate (clean, 0 violations) and the journal root: "every decision is hash-chained."

## 1:45 - 2:40 Integrate + verify (the wow)

```bash
npx bitgetbench init
# edit decide(ctx) briefly, or keep the scaffolded SMA agent
bitgetbench backtest --config bitgetbench.config.json --journal run.journal.jsonl --submit
```

- Show the JSON: metrics, leakCertificate clean, journalRoot, score. Refresh the board: the new row appears.

```bash
bitgetbench verify run.journal.jsonl          # ok
# tamper one line of the journal, then:
bitgetbench verify run.journal.jsonl          # ok:false, brokenAt:<n>
```

"Edit any entry and the chain breaks. The results are tamper-evident."

## 2:40 - 3:00 Close

"One interface, leak-free, guardrailed, verifiable, and live. Open source, MIT. Other contestants' agents can appear on this same board." Show the repo URL + the QR again.

## Recording shot list

1. Leaderboard home (counters + heartbeat + QR).
2. A run detail (charts + leak badge + journal root).
3. Terminal: init -> backtest --submit -> board refresh shows the new row.
4. Terminal: verify ok, then verify after a tamper (fails).
5. The repo README.
