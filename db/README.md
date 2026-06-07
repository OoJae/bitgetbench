# @bitgetbench/db

Drizzle ORM schema and migrations, shared by the engine and the leaderboard.

Lands in Phase 3. The same schema runs on Postgres (Neon or Supabase, for the deployed leaderboard) and on SQLite (for zero-setup local dev). Tables: runs, trades, metrics, journal entries, telemetry events.
