# Deploy

The leaderboard and the live paper-sandbox run on a single VPS (Ubuntu). The leaderboard is a
Next.js app served by `next start` behind nginx; the sandbox is a 15-minute cron that syncs
new candles, re-runs the reference agents, and updates the shared SQLite database.

## Config

Copy `deploy/.env.example` to `deploy/.env` on the VPS (gitignored) and set `BENCH_SERVER_NAME`
(the IP or domain for the nginx vhost), optionally `NEXT_PUBLIC_SITE_URL` (baked into the web
build for the QR/share link), and `BITGETBENCH_DB`. `provision.sh` and the systemd service read
it; the repo never contains the host address.

## One-time

From the repo root, rsync the source to the VPS (excluding build output and node_modules),
then run the provisioning script:

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude dist \
  --exclude '*.tsbuildinfo' --exclude data-cache/bitgetbench.db \
  ./ <host>:/opt/bitgetbench/

ssh <host> 'cd /opt/bitgetbench && bash deploy/provision.sh'
```

`provision.sh` installs Node 24 + pnpm, builds, seeds the board if empty, installs the
systemd service (`bitgetbench-web`), the nginx reverse proxy (port 80 to 3000), and the
sandbox cron.

## Files

- `bitgetbench-web.service` - systemd unit for the leaderboard.
- `start-web.sh` - launcher with a full PATH and the DB path.
- `nginx-bitgetbench.conf` - reverse proxy 80 to 3000.
- `provision.sh` - idempotent installer/updater.

## Notes

- The cloud security group must allow inbound port 80.
- The shared DB lives at `/opt/bitgetbench/data-cache/bitgetbench.db`; both the web service and
  the cron point at it via `BITGETBENCH_DB`.
- Updates: rsync again, then `ssh <host> 'cd /opt/bitgetbench && bash deploy/provision.sh'`.
- Optional Telegram alerts on cron failure: set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
