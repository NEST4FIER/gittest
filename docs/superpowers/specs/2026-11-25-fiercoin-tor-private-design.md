# FierCoin private mode over Tor: design

Approved 2026-11-25. First of three survival adaptations (then mesh radio, then MWEB privacy).

## Why
A FierCoin node publishes its home IP: UPnP is on by default and nodes listen on 29333.
The coin carries a political genesis message and lives in a public repo. If politics turn
hostile, the owner should be able to mine and pay without announcing where they live.

## Goals
- PC wallet: a "private mode" a non-technical person can switch on, so the PC never
  accepts incoming connections, never opens a router port, and makes every outgoing
  connection through Tor.
- Seed server: gets a stable `.onion` address automatically, so Tor users can reach it
  without its IP, and the owner can share that address.
- Honest about what it doesn't hide.

## Non-goals
- Hiding payments on the chain (that is MWEB, project 3).
- Android app changes (it passes fixed start-up options; needs an app rebuild). Guide gives
  an interim answer.
- Rebuilding any binaries.

## Approaches considered
1. **Docs + server installer (picked).** Settings already in Litecoin 0.21.4 do the work;
   no rebuild. Cheap, testable.
2. Bundle Tor inside the Windows wallet. Needs a rebuild and a Windows build setup we don't
   have. Later, maybe.
3. Strict `onlynet=onion`. Dropped: the built-in fallback seed is an IPv4 address, so a
   strict node can't find the network unless it already knows an onion peer.

## Facts checked in Litecoin v0.21.4 source
- `-proxy` soft-sets `-listen=0`, and `-listen=0` soft-sets `-upnp=0` (init.cpp 828-844).
- Tor control creates a v3 onion service (`NEW:ED25519-V3`) and keeps its key in
  `onion_v3_private_key`, so the address survives restarts (torcontrol.cpp 541, 727).
- On a successful Tor control connection the node also sets the onion proxy to
  127.0.0.1:9050 by itself (torcontrol.cpp 533-536).
- `-listenonion` defaults on and `-torcontrol` defaults to 127.0.0.1:9051, so the server's
  existing `fiercoin.conf` needs no change.
- BIP155 (addrv2) is present, so v3 onion addresses can spread between nodes.

## Design
- **Guide** (`FierCoin-Guide.txt`, both copies, plus `SHA256SUMS.txt`): new section
  "PRIVATE MODE (HIDE YOUR HOME ADDRESS)":
  - PC: install Tor Browser and keep it open (SOCKS on 127.0.0.1:9150). In FierCoin:
    Settings > Options > Network: untick "Map port using UPnP" and "Allow incoming
    connections", tick "Connect through SOCKS5 proxy" 127.0.0.1 port 9150. Config-file
    alternative: `proxy=127.0.0.1:9150`, `listen=0`, `upnp=0`.
  - Android, until an app update: Orbot in VPN mode for the FierCoin app; use mobile data
    rather than home Wi-Fi, since the app can still open a port on a home router.
  - iPhone web wallet: open it in Onion Browser.
  - What it doesn't hide: payments are still public on the chain; your Tor use is visible
    to your internet provider; an always-on miner is still a busy PC.
- **Server installer** (`install.sh`): install `tor`; enable its control port with cookie
  auth readable by the `debian-tor` group (idempotent, marked block in `/etc/tor/torrc`);
  add the `fiercoin` user to `debian-tor`; restart Tor before starting the node; after
  start, wait up to 60 s for a `.onion` in `getnetworkinfo` and print it. Tor trouble
  never fails the install: it prints a note instead.
- **Server README**: what the Tor part does and how to read the onion address later.
- **Test**: a GitHub Actions workflow runs `install.sh` on a fresh Ubuntu 24.04 runner
  when the server files change, and checks the node is up and has a `.onion` address.

## Left to the builder
Exact wording, the poll loop, and the workflow's pass/fail checks.
