# FierCoin Private Mode over Tor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let FierCoin users run without publishing their home IP, and give the seed server a stable `.onion` address.

**Architecture:** No rebuild. The PC side is guide text using settings Litecoin 0.21.4 already has. The server side is `install.sh` installing Tor and letting the node's built-in Tor control create a v3 onion service. A GitHub Actions job proves the installer on a fresh Ubuntu 24.04.

**Tech Stack:** bash, Ubuntu 24.04 `tor` package, systemd, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-25-fiercoin-tor-private-design.md`

## Global Constraints

- Branch `claude/fiercoin-tor-private`, stacked on PRs #20, #21, #22; PR base `claude/salon-work-website-95l1m7`.
- Files committed with LF line endings (clone has `core.autocrlf=false`).
- `fiercoin-release/FierCoin-Guide.txt` and `fiercoin-site/download/FierCoin-Guide.txt` stay byte-identical; `fiercoin-site/download/SHA256SUMS.txt` lists the new hash.
- Do not edit `fiercoin.conf` on existing servers; Tor defaults (`listenonion=1`, `torcontrol=127.0.0.1:9051`) do the work.
- Tor problems never fail `install.sh`.
- Plain-English wording, same voice as the existing guide.
- Do not use `onlynet=onion` anywhere (fallback seed is IPv4).

## Review Focus

- Re-running `install.sh` on the live seed: the torrc block must appear once, not twice.
- Tor can't reach its network (blocked or slow): install finishes and prints a note, no `die`.
- Tor Browser closed while FierCoin is in private mode: the guide must say FierCoin then shows 0 connections and how to fix it.
- Someone pastes the guide's config lines while also ticking the GUI boxes: harmless duplicates; guide says use one or the other.
- Workflow on a runner where `ufw enable` runs: job must still finish (runner traffic is outbound).

---

### Task 1: Seed server gets a .onion address

**Files:**
- Create: `.github/workflows/fiercoin-server-test.yml`
- Modify: `fiercoin-release/server/install.sh` (package list; new Tor block before "Starting FierCoin"; summary)
- Modify: `fiercoin-release/server/README.md` ("What it does" list)

- [ ] **Step 1: Write the test workflow.** Triggers: `pull_request` on paths `fiercoin-release/server/**` and the workflow file, plus `workflow_dispatch`. Job on `ubuntu-24.04`: `sudo FIERCOIN_BASE=<raw URL of server/bin on the PR head sha> bash fiercoin-release/server/install.sh`, then assert:
  - `systemctl is-active fiercoind tor` both active;
  - `grep -c 'FierCoin Tor control' /etc/tor/torrc` equals 1 after running install.sh a **second** time;
  - `sudo fiercoin-cli -datadir=/var/lib/fiercoin getnetworkinfo` contains `[a-z2-7]{56}\.onion` within 120 s;
  - install output contains `Private (Tor) address:`.
- [ ] **Step 2: Syntax-check.** Run `bash -n fiercoin-release/server/install.sh` and parse the workflow YAML with node (`js-yaml` not needed: check with GitHub after push). Expected: current install.sh passes `bash -n`; the workflow's onion assertion would FAIL on the current installer (no Tor).
- [ ] **Step 3: Implement in install.sh.** Add `tor` to the apt list. New section `say "Setting up Tor (private .onion address for this node)"`: append once, between `# >>> FierCoin Tor control` / `# <<< FierCoin Tor control` markers, `ControlPort 9051`, `CookieAuthentication 1`, `CookieAuthFileGroupReadable 1`; `usermod -aG debian-tor fiercoin`; `systemctl restart tor`. All of it `|| true`-guarded with a note on failure. After services start: poll `getnetworkinfo` up to 60 s for an onion; summary prints `Private (Tor) address:  <onion>:29333` or a one-line "not ready yet, check later with …" note.
- [ ] **Step 4: README.** Add a bullet: installs Tor, node gets a permanent `.onion` (key in `/var/lib/fiercoin/onion_v3_private_key`, keep it backed up), how to read it: `fiercoin-cli -datadir=/var/lib/fiercoin getnetworkinfo`.
- [ ] **Step 5: `bash -n` again, commit** `FierCoin server: private .onion address through Tor`.

### Task 2: Guide section "PRIVATE MODE"

**Files:**
- Modify: `fiercoin-release/FierCoin-Guide.txt` (new section after LETTING FRIENDS JOIN)
- Modify: `fiercoin-site/download/FierCoin-Guide.txt` (copy of the above)
- Modify: `fiercoin-site/download/SHA256SUMS.txt` (guide line)

- [ ] **Step 1: Write the section** per spec "Design > Guide": PC GUI steps (Tor Browser open, 127.0.0.1 port 9150, untick UPnP and incoming), config-file alternative (`proxy=127.0.0.1:9150`, `listen=0`, `upnp=0`, "use one or the other"), "0 connections = open Tor Browser", Android (Orbot VPN mode, mobile data), iPhone (Onion Browser), "What it does NOT hide" (3 items from spec), server owners: the installer prints the onion address.
- [ ] **Step 2: Copy and hash.** `cp` release → site; update the guide line in SHA256SUMS.txt.
- [ ] **Step 3: Verify.** `cmp` the two copies (no output) and `sha256sum -c` the guide line from `fiercoin-site/download` (prints `FierCoin-Guide.txt: OK`). `grep -c onlynet` on the guide prints 0.
- [ ] **Step 4: Commit** `FierCoin guide: private mode through Tor`.

### Task 3: Ship

- [ ] **Step 1:** `watcher_clear` for pushing a branch and opening a PR on the public repo; follow the answer.
- [ ] **Step 2:** Push, open PR (says: stacked on #20–22, merge those first; what it hides and doesn't; live seed needs `install.sh` re-run by the owner).
- [ ] **Step 3:** Watch the workflow run; fix until green; report the result.
