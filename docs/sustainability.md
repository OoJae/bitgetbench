# Sustainability: why BitgetBench outlives the hackathon

## The gap it fills, permanently

The Bitget Agent Hub ships perception (analyst skills) and execution (58 tools), but no honest scoring, no sandbox, and no risk guardrails. Bitget's own Playbook is closed beta. Every agent built on the Hub needs a way to prove it is not leaking, not over-fitting, and not blowing up on risk. BitgetBench is that layer, and it is open (MIT), so it does not depend on us to keep existing.

## Open infrastructure Bitget can absorb

The whole thing is one TypeScript monorepo with a single integration interface (`BenchAgent`) and a documented composite score. It has no proprietary dependencies: public market data, a built-in SQLite driver, a Next.js leaderboard. Bitget could fork it into the Agent Hub repo as the official evaluation layer, or run the leaderboard as a community service, without rewriting anything. The DDL is a mechanical port to Postgres for scale.

## Distribution moat (emerging markets)

Adoption is the metric. The first users come from large, mobile-first, social-trading Telegram communities in Nigeria, Kenya, and South Africa, where crypto adoption is among the fastest in the world. A free, honest "benchmark your agent" tool with a public leaderboard is exactly the kind of thing those communities share. Every contestant who runs their agent through it adds a real user, a real API call count, and a real sim-trade log: the verifiable evidence the hackathon judges on, compounding on its own.

## Trading-equality narrative

The same rigor that protects judges from inflated backtests protects retail traders from strategies that only look good because they leaked. Honest evaluation is a public good, and it maps onto Bitget's stated mission of letting ordinary users trade like professionals.

## Roadmap (post-hackathon)

- Postgres (Neon/Supabase) + Vercel for horizontal scale; the schema already ports mechanically.
- Multi-symbol and multi-timeframe coverage, and a walk-forward view on the leaderboard.
- An LLM-in-the-loop live agent in the sandbox (low-frequency, where live analyst-skill perception is legitimate).
- On-chain anchoring of the journal root for third-party-verifiable integrity.
- A "challenge" mode where contestants compete on a fixed window and policy.

## What it deliberately is not

Not a real-capital trading bot, not a strategy marketplace, not a no-code builder. It is the trust layer underneath all of those, which is why it stays useful no matter what gets built on top.
