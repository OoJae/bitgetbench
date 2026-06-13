#!/usr/bin/env bash
# Idempotent provisioning for the BitgetBench VPS. Run as root from /opt/bitgetbench after
# the source has been rsynced there. Installs Node + pnpm, builds, seeds the board if empty,
# and wires up the systemd web service, the nginx reverse proxy, and the sandbox cron.
set -euo pipefail

APP_DIR=/opt/bitgetbench
cd "$APP_DIR"

# Optional config (gitignored). BENCH_SERVER_NAME scopes the nginx vhost; NEXT_PUBLIC_SITE_URL
# is baked into the web build for the QR/share link; BITGETBENCH_DB is the shared database.
if [ -f deploy/.env ]; then
  set -a
  . deploy/.env
  set +a
fi
DB="${BITGETBENCH_DB:-$APP_DIR/data-cache/bitgetbench.db}"
BENCH_SERVER_NAME="${BENCH_SERVER_NAME:-_}"

echo "== Node + pnpm =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@11.1.2
fi
node -v
pnpm -v

echo "== install + build =="
pnpm install
pnpm build
# NEXT_PUBLIC_SITE_URL (if set in deploy/.env) is inlined into the web build for the QR.
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" pnpm build:web

echo "== seed board if empty =="
if [ ! -f "$DB" ]; then
  BITGETBENCH_DB="$DB" node packages/cli/dist/bin.js seed --db "$DB" || true
fi

echo "== systemd web service =="
chmod +x deploy/start-web.sh
cp deploy/bitgetbench-web.service /etc/systemd/system/bitgetbench-web.service
systemctl daemon-reload
systemctl enable bitgetbench-web
systemctl restart bitgetbench-web

echo "== nginx reverse proxy =="
sed "s/__BENCH_SERVER_NAME__/${BENCH_SERVER_NAME}/" deploy/nginx-bitgetbench.conf \
  > /etc/nginx/sites-available/bitgetbench
ln -sf /etc/nginx/sites-available/bitgetbench /etc/nginx/sites-enabled/bitgetbench
# Non-destructive: we add a server block scoped to BENCH_SERVER_NAME and leave the host's
# other sites alone.
nginx -t
systemctl reload nginx

echo "== sandbox cron (every 15 min) =="
CRON_LINE="*/15 * * * * cd $APP_DIR && BITGETBENCH_DB=$DB /usr/bin/node packages/cli/dist/bin.js sandbox >> /var/log/bitgetbench-sandbox.log 2>&1 # bitgetbench-sandbox"
( crontab -l 2>/dev/null | grep -v 'bitgetbench-sandbox' || true; echo "$CRON_LINE" ) | crontab -

echo "== run one sandbox cycle now =="
BITGETBENCH_DB="$DB" /usr/bin/node packages/cli/dist/bin.js sandbox >> /var/log/bitgetbench-sandbox.log 2>&1 || true

echo "== done =="
systemctl --no-pager status bitgetbench-web | head -5 || true
