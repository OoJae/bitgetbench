#!/usr/bin/env bash
# Idempotent provisioning for the BitgetBench VPS. Run as root from /opt/bitgetbench after
# the source has been rsynced there. Installs Node + pnpm, builds, seeds the board if empty,
# and wires up the systemd web service, the nginx reverse proxy, and the sandbox cron.
set -euo pipefail

APP_DIR=/opt/bitgetbench
DB="$APP_DIR/data-cache/bitgetbench.db"
cd "$APP_DIR"

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
pnpm build:web

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
cp deploy/nginx-bitgetbench.conf /etc/nginx/sites-available/bitgetbench
ln -sf /etc/nginx/sites-available/bitgetbench /etc/nginx/sites-enabled/bitgetbench
# Non-destructive: we add an IP-scoped server block and leave the host's other sites alone.
nginx -t
systemctl reload nginx

echo "== sandbox cron (every 15 min) =="
CRON_LINE="*/15 * * * * cd $APP_DIR && BITGETBENCH_DB=$DB /usr/bin/node packages/cli/dist/bin.js sandbox >> /var/log/bitgetbench-sandbox.log 2>&1 # bitgetbench-sandbox"
( crontab -l 2>/dev/null | grep -v 'bitgetbench-sandbox' || true; echo "$CRON_LINE" ) | crontab -

echo "== run one sandbox cycle now =="
BITGETBENCH_DB="$DB" /usr/bin/node packages/cli/dist/bin.js sandbox >> /var/log/bitgetbench-sandbox.log 2>&1 || true

echo "== done =="
systemctl --no-pager status bitgetbench-web | head -5 || true
