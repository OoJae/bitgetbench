# reference-agents

Two example `BenchAgent` implementations that prove the harness and seed the leaderboard.

1. SMA-crossover (no LLM, pure rules): a deterministic baseline. Lands in Phase 1.
2. Skill-driven momentum (calls Agent Hub `sentiment-analyst` + `technical-analysis` Skills, lets an LLM decide): proves real Agent Hub integration. Lands in Phase 2.
