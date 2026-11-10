#!/usr/bin/env bash
# One-command NOVA install for an Oracle Cloud (or any Ubuntu/Debian) VM.
#
#   curl -fsSL https://raw.githubusercontent.com/yeezeedonthavekids-gif/Novaproxy/claude/eloquent-johnson-qpbzo2/deploy/oracle-setup.sh | sudo bash
#
# Optional environment variables:
#   DOMAIN=nova.example.com   use your own domain (default: <public-ip>.sslip.io, no domain needed)
#   ALLOWED_ORIGINS=https://your-site.netlify.app   extra sites allowed to use this Wisp server
#   BRANCH=main               git branch to install
set -euo pipefail

REPO="https://github.com/yeezeedonthavekids-gif/Novaproxy.git"
BRANCH="${BRANCH:-claude/eloquent-johnson-qpbzo2}"
DIR="/opt/nova"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }

say "Installing Docker and git"
apt-get update -y -qq
apt-get install -y -qq git curl ca-certificates iptables-persistent >/dev/null 2>&1 || apt-get install -y -qq git curl ca-certificates
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Opening ports 80 and 443 in the VM firewall"
# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null; fi

say "Downloading NOVA ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH" && git -C "$DIR" checkout -q FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ -z "${DOMAIN:-}" ]; then
  IP="$(curl -fsS4 https://api.ipify.org || curl -fsS4 https://ifconfig.me)"
  DOMAIN="${IP//./-}.sslip.io"
fi
ORIGINS="https://$DOMAIN${ALLOWED_ORIGINS:+,$ALLOWED_ORIGINS}"

say "Writing configuration for $DOMAIN"
touch .env
grep -q '^DOMAIN=' .env && sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env || echo "DOMAIN=$DOMAIN" >> .env
grep -q '^ALLOWED_ORIGINS=' .env && sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGINS|" .env || echo "ALLOWED_ORIGINS=$ORIGINS" >> .env

say "Building and starting NOVA (first build takes a few minutes)"
docker compose -f docker-compose.caddy.yml up -d --build

say "Waiting for NOVA to become healthy"
for _ in $(seq 1 60); do
  if docker compose -f docker-compose.caddy.yml exec -T nova node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 3
done

cat <<DONE

  NOVA is running.

  Open NOVA:        https://$DOMAIN
  Wisp server URL:  wss://$DOMAIN/wisp/
  Health check:     https://$DOMAIN/health

  If the page doesn't load, open ports 80 and 443 in Oracle's console:
  Networking > Virtual cloud networks > your VCN > Security Lists >
  Default Security List > Add Ingress Rules (source 0.0.0.0/0, TCP, ports 80 and 443).

  Allow another site (e.g. Netlify) to use this server:
    sudo ALLOWED_ORIGINS=https://your-site.netlify.app bash $DIR/deploy/oracle-setup.sh

  Update later:  sudo bash $DIR/deploy/oracle-setup.sh
  Logs:          cd $DIR && sudo docker compose -f docker-compose.caddy.yml logs -f
DONE
