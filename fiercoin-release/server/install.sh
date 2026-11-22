#!/bin/bash
# FierCoin server setup: runs a FierCoin node (the network's always-on meeting point),
# the FierCoin Explorer website, and the FierCoin web wallet for iPhone.
# A free secure (https) address is set up automatically: https://<ip-with-dashes>.sslip.io
#
# Use on a fresh Ubuntu 24.04 server, logged in as root:
#   curl -fsSL https://raw.githubusercontent.com/NEST4FIER/gittest/claude/salon-work-website-95l1m7/fiercoin-release/server/install.sh | bash
#
# Safe to run again: it updates the programs and keeps the blockchain.
set -euo pipefail

BASE="${FIERCOIN_BASE:-https://raw.githubusercontent.com/NEST4FIER/gittest/claude/salon-work-website-95l1m7/fiercoin-release/server/bin}"
APP=/opt/fiercoin
DATA=/var/lib/fiercoin

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Please run this as root (or put 'sudo' in front)."
[ "$(uname -m)" = x86_64 ] || die "This server is $(uname -m); FierCoin's server files are for x86_64 (Intel/AMD) servers."
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = "24.04" ] || die "Please use Ubuntu 24.04 (this server is ${PRETTY_NAME:-unknown})."

say "Installing the libraries FierCoin needs"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates ufw caddy \
  libboost-filesystem1.83.0 libboost-thread1.83.0 libdb5.3++t64 libevent-2.1-7t64 \
  libevent-core-2.1-7t64 libevent-pthreads-2.1-7t64 libfmt9 libsqlite3-0 libssl3t64 >/dev/null

say "Downloading FierCoin"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for f in fiercoind fiercoin-cli fiercoin-explorer SHA256SUMS; do
  curl -fsSL "$BASE/$f" -o "$TMP/$f" || die "Could not download $f"
done
(cd "$TMP" && sha256sum -c SHA256SUMS >/dev/null) || die "Downloaded files are damaged (checksum mismatch). Try again."

say "Installing"
id fiercoin >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin fiercoin
mkdir -p "$APP" "$DATA"
systemctl stop fiercoin-explorer 2>/dev/null || true
systemctl stop fiercoind 2>/dev/null || true
install -m 755 "$TMP/fiercoind" "$TMP/fiercoin-cli" "$TMP/fiercoin-explorer" "$APP/"
ln -sf "$APP/fiercoin-cli" /usr/local/bin/fiercoin-cli

if [ ! -f "$DATA/fiercoin.conf" ]; then
  cat > "$DATA/fiercoin.conf" <<'EOF'
# FierCoin server settings
server=1
txindex=1
listen=1
disablewallet=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
maxconnections=64
dbcache=100
EOF
fi
chown -R fiercoin:fiercoin "$DATA"

cat > /etc/systemd/system/fiercoind.service <<EOF
[Unit]
Description=FierCoin node
After=network-online.target
Wants=network-online.target

[Service]
User=fiercoin
Group=fiercoin
ExecStart=$APP/fiercoind -datadir=$DATA -printtoconsole=0
ExecStop=$APP/fiercoin-cli -datadir=$DATA stop
Restart=always
RestartSec=10
TimeoutStopSec=120
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fiercoin-explorer.service <<EOF
[Unit]
Description=FierCoin Explorer website
After=fiercoind.service
Requires=fiercoind.service

[Service]
User=fiercoin
Group=fiercoin
ExecStart=$APP/fiercoin-explorer -datadir=$DATA -listen 127.0.0.1:8080 -nobrowser
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

IP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
HOST="${IP//./-}.sslip.io"

say "Setting up the secure web address https://$HOST"
cat > /etc/caddy/Caddyfile <<EOF
# FierCoin: secure (https) address for the explorer and the iPhone web wallet.
$HOST {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}

# The plain address (http://$IP) keeps working too.
http://$IP {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF

say "Opening the firewall (SSH, website, FierCoin network)"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 29333/tcp >/dev/null
ufw --force enable >/dev/null

say "Starting FierCoin"
systemctl daemon-reload
systemctl enable --now fiercoind >/dev/null 2>&1
sleep 5
systemctl enable --now fiercoin-explorer >/dev/null 2>&1
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
sleep 5

if systemctl is-active --quiet fiercoind && systemctl is-active --quiet fiercoin-explorer && systemctl is-active --quiet caddy; then
  cat <<EOF

=====================================================
  FierCoin server is running!
=====================================================
  Explorer website:   https://$HOST   (or http://$IP)
  iPhone web wallet:  https://$HOST/wallet/
  Network address:    $IP:29333

  Next steps:
  - On each phone app: "Connect to your laptop or friends" -> type $IP
  - On the PC wallet: Settings > Options > Open Configuration File, add:
        addnode=$IP:29333
    then restart FierCoin.

  Useful commands on this server:
    fiercoin-cli -datadir=$DATA getblockcount      (how many blocks)
    fiercoin-cli -datadir=$DATA getconnectioncount (how many computers connected)
    systemctl restart fiercoind fiercoin-explorer caddy  (restart everything)
=====================================================
EOF
else
  systemctl --no-pager status fiercoind fiercoin-explorer caddy | tail -30
  die "Something did not start. Send a screenshot of the text above."
fi
