#!/usr/bin/env bash
# Launch the BitgetBench write API for systemd. Binds the API port (nginx routes the write paths
# to it); writes to the same shared SQLite database the web service reads and the sandbox writes.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export NODE_ENV=production
export BITGETBENCH_DB="${BITGETBENCH_DB:-/opt/bitgetbench/data-cache/bitgetbench.db}"
export BENCH_API_PORT="${BENCH_API_PORT:-3940}"
cd /opt/bitgetbench
exec node packages/api/dist/bin.js
