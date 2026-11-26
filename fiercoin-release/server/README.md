# FierCoin cloud server

Runs an always-on FierCoin node, plus the FierCoin Explorer website and the iPhone web wallet at a free secure (https) address.

**Needs:** a fresh **Ubuntu 24.04** x86_64 server. 1 GB of RAM is enough, for example a $5–6/month droplet.

Log in as root, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/NEST4FIER/gittest/claude/salon-work-website-95l1m7/fiercoin-release/server/install.sh | bash
```

What it does:
- **Installs** the programs to `/opt/fiercoin` and keeps the blockchain in `/var/lib/fiercoin`. It also installs the Caddy web server.
- **Runs** three systemd services: `fiercoind` (the node), `fiercoin-explorer` (the website) and `caddy`. The explorer only listens on `127.0.0.1:8080`, and Caddy passes visitors on to it.
- **Sets up the https address**, `https://<ip-with-dashes>.sslip.io`. For example, a server at 203.0.113.10 gets `https://203-0-113-10.sslip.io`. The website also works at the plain `http://<ip>`.
- **Serves the iPhone web wallet** at `https://<ip-with-dashes>.sslip.io/wallet/`.
- **Opens the firewall** for ports 22 (SSH), 80 and 443 (the website) and 29333 (the FierCoin network).
- **Sets up Tor**, so the node also gets a private `.onion` address that wallets in private mode can reach inside Tor (see "PRIVATE MODE" in the guide). The installer prints it at the end; to see it later, run `fiercoin-cli -datadir=/var/lib/fiercoin getnetworkinfo` and look for `.onion`. The address stays the same across restarts and updates because its key is kept in `/var/lib/fiercoin/onion_v3_private_key`: back that file up to keep the address. This does not hide the server: its normal IP address is still public, and the `.onion` is just a second way in for Tor users. Tor needs no open ports. If Tor can't be set up, the install still finishes and the node runs without it.

It is safe to run again to update; the blockchain is kept.

The files in `bin/` are a stripped Linux build of FierCoin and the Explorer (`../explorer`), which also serves the iPhone web wallet. The FierCoin programs are built with three patches, applied in this order:

1. `fiercoin-changes.patch`: the coin itself.
2. `fiercoin-network.patch`: the built-in seed node `68.183.155.121:29333`, and a quick fallback to it.
3. `fiercoin-tipage.patch`: a node only counts as "still syncing" if its newest block is over 30 days old.

The node is built with UPnP (`--with-miniupnpc --enable-upnp-default`). That's why the installer installs `libminiupnpc17`. `../BUILD-NOTES.md` has the build steps. `SHA256SUMS` lets the installer check the files.
