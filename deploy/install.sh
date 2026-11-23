#!/usr/bin/env bash
# Auf dem Server als normaler Benutzer mit sudo ausführen, im entpackten Projektordner:
#   bash deploy/install.sh
set -euo pipefail

need_node() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; }
if ! need_node; then
  echo "Installiere Node.js ..."
  sudo apt-get update && sudo apt-get install -y nodejs
  need_node || { echo "Node 22+ nötig, gefunden: $(node --version 2>/dev/null || echo keins). Siehe README."; exit 1; }
fi

id meintag >/dev/null 2>&1 || sudo useradd --system --home /opt/meintag --shell /usr/sbin/nologin meintag
sudo mkdir -p /opt/meintag/data
sudo rsync -a --delete --exclude data --exclude .env ./ /opt/meintag/
if [ ! -f /opt/meintag/.env ]; then
  sudo cp .env.example /opt/meintag/.env
  echo ">>> Bitte /opt/meintag/.env ausfüllen: sudo nano /opt/meintag/.env"
fi
sudo chown -R meintag:meintag /opt/meintag
sudo chmod 600 /opt/meintag/.env
sudo cp deploy/meintag.service /etc/systemd/system/meintag.service
sudo systemctl daemon-reload
sudo systemctl enable meintag
sudo systemctl restart meintag || true
echo "Fertig. Status: sudo systemctl status meintag   Log: sudo journalctl -u meintag -f"
