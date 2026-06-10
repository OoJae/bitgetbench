#!/usr/bin/env bash
# Launch the leaderboard for systemd. Sets a full PATH (systemd's is minimal) and points the
# app at the shared SQLite database the sandbox cron writes.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export NODE_ENV=production
export BITGETBENCH_DB=/opt/bitgetbench/data-cache/bitgetbench.db
cd /opt/bitgetbench/apps/leaderboard
exec pnpm start
