# FierCoin cloud server

Runs an always-on FierCoin node (the network's meeting point) and the FierCoin Explorer website on port 80.

**Needs:** a fresh **Ubuntu 24.04** x86_64 server. 1 GB of RAM is enough, for example a $5–6/month droplet.

Log in as root, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/NEST4FIER/gittest/claude/salon-work-website-95l1m7/fiercoin-release/server/install.sh | bash
```

What it does:
- **Installs** the programs to `/opt/fiercoin` and keeps the blockchain in `/var/lib/fiercoin`.
- **Runs** two systemd services, `fiercoind` and `fiercoin-explorer`.
- **Opens the firewall** for ports 22, 80 and 29333.

It is safe to run again to update; the blockchain is kept.

The files in `bin/` are a stripped Linux build of FierCoin (from `fiercoin-changes.patch`) and the Explorer (`../explorer`). `SHA256SUMS` lets the installer check them.
