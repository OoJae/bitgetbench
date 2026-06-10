#!/usr/bin/env bash
# Launch the leaderboard for systemd. Sets a full PATH (systemd's is minimal) and points the
# app at the shared SQLite database the sandbox cron writes.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export NODE_ENV=production
export BITGETBENCH_DB=/opt/bitgetbench/data-cache/bitgetbench.db
cd /opt/bitgetbench/apps/leaderboard
# Bind localhost only on a dedicated port (3000 is used by another app on this host);
# nginx proxies port 80 to it. 3939 avoids the other services running on this VPS.
exec node_modules/.bin/next start -H 127.0.0.1 -p 3939
