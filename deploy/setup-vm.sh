#!/usr/bin/env bash
# One-time setup for a fresh GCP e2-micro VM (Debian 12 or Ubuntu 22.04+).
# Run as a user with sudo, e.g.: bash setup-vm.sh
set -euo pipefail

APP_DIR=/opt/hoodmap
SERVICE_USER=hoodmap
NODE_MAJOR=20

echo "== installing Node ${NODE_MAJOR}.x =="
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
sudo apt-get install -y nodejs git

echo "== creating unprivileged service user =="
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "== cloning repo =="
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo git clone <YOUR_REPO_URL> "$APP_DIR"
fi
cd "$APP_DIR"

echo "== install deps + build =="
sudo -u "$SERVICE_USER" npm ci --omit=dev=false
sudo -u "$SERVICE_USER" npm run build

echo "== NOTE: copy your .env into $APP_DIR/.env now (scp it, do not paste secrets into shell history) =="
echo "    scp .env <vm-user>@<vm-ip>:/tmp/env-upload && sudo mv /tmp/env-upload $APP_DIR/.env"
echo "    sudo chown $SERVICE_USER:$SERVICE_USER $APP_DIR/.env && sudo chmod 600 $APP_DIR/.env"
read -rp "Press enter once $APP_DIR/.env is in place..."

echo "== running DB migrations =="
sudo -u "$SERVICE_USER" bash -c "cd $APP_DIR && set -a && source .env && set +a && node dist/db/migrate.js"

echo "== installing systemd units =="
sudo cp deploy/hoodmap-indexer.service deploy/hoodmap-api.service deploy/hoodmap-stats.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoodmap-indexer hoodmap-api hoodmap-stats

echo "== done. check status with: =="
echo "    systemctl status hoodmap-indexer hoodmap-api hoodmap-stats"
echo "    journalctl -u hoodmap-api -f"
