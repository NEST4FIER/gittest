#!/usr/bin/env python3
"""FierCoin mesh gateway: lets phones with no internet use FierCoin over Meshtastic radio.

Run it on any computer that has internet and a Meshtastic radio plugged in by USB:

    pip install meshtastic
    python firc_mesh_gateway.py                    # uses the main FierCoin server
    python firc_mesh_gateway.py --server http://localhost:8080 --port COM5

Phones send "FIRC U <address>" to ask for their coins and "FIRC T ..." lines with a signed
payment. The gateway answers on the same channel (or privately, if they messaged it directly).
It never sees anyone's 12 words or password: payments arrive already signed.
The message format is in MESH-FORMAT.md.
"""
import argparse
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.request

DEFAULT_SERVER = "https://68-183-155-121.sslip.io"
MAX_LINE = 200
PART = 180
MAX_PARTS = 20
MAX_COINS = 6
COINS_PER_LINE = 3
MAX_MESSAGE = 150
PENDING_SECONDS = 600
MAX_PENDING = 50
OFFLINE = "This gateway can't reach the FierCoin server right now. Try later."

RE_ADDR = re.compile(r"^(firc1[02-9ac-hj-np-z]{6,87}|[Ff][1-9A-HJ-NP-Za-km-z]{25,34})$")
RE_ID = re.compile(r"^[0-9a-z]{4}$")
RE_B64U = re.compile(r"^[A-Za-z0-9_-]+$")


class ServerDown(Exception):
    """The FierCoin server couldn't be reached."""


class Refused(Exception):
    """The FierCoin server answered with an error."""


def b64u(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def b36(n):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if n == 0:
            return out


def short(msg):
    msg = " ".join(str(msg).split())
    return msg if len(msg) <= MAX_MESSAGE else msg[: MAX_MESSAGE - 3] + "..."


def coin_lines(address, utxos):
    """The reply lines for "FIRC U <address>": the biggest spendable coins."""
    tag = address[-6:]
    best = sorted((u for u in utxos if u.get("mature", True)), key=lambda u: -int(u["value"]))
    sent, more = best[:MAX_COINS], max(0, len(best) - MAX_COINS)
    if not sent:
        return [f"FIRC u {tag} 1/1 none"]
    coins = [f'{b64u(bytes.fromhex(u["txid"]))}.{b36(int(u["vout"]))}.{b36(int(u["value"]))}' for u in sent]
    groups = [coins[i : i + COINS_PER_LINE] for i in range(0, len(coins), COINS_PER_LINE)]
    lines = [f"FIRC u {tag} {i + 1}/{len(groups)} " + " ".join(g) for i, g in enumerate(groups)]
    if more:
        lines[-1] += f" +{more}"
    return lines


class Server:
    """Talks to a FierCoin explorer's wallet API (the same one the iPhone web wallet uses)."""

    def __init__(self, base=DEFAULT_SERVER, timeout=20):
        self.base = base.rstrip("/")
        self.timeout = timeout

    def _call(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + "/api" + path, data=data,
                                     headers={"Content-Type": "application/json", "User-Agent": "fiercoin-mesh-gateway"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                msg = json.load(e).get("error") or str(e)
            except Exception:
                msg = str(e)
            raise Refused(msg)
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise ServerDown(str(e))

    def utxos(self, address):
        return self._call("/utxos/" + address)["utxos"]

    def broadcast(self, hexstr):
        return self._call("/broadcast", {"hex": hexstr})["txid"]


class Gateway:
    """Reads one text message and returns the reply lines (often none)."""

    def __init__(self, server, clock=time.monotonic):
        self.server = server
        self.clock = clock
        self.pending = {}  # (sender, id) -> {"n": int, "parts": {i: str}, "at": float}

    def handle(self, sender, text):
        words = (text or "").strip().split(" ")
        if len(words) < 2 or words[0] != "FIRC":
            return []
        if words[1] == "U":
            return self._coins(words)
        if words[1] == "T":
            return self._part(sender, words)
        return []  # lower-case replies from other gateways, or unknown

    def _coins(self, words):
        if len(words) != 3 or not RE_ADDR.match(words[2]):
            return ["FIRC err - That isn't a FierCoin address. Send: FIRC U <your address>"]
        try:
            return coin_lines(words[2], self.server.utxos(words[2]))
        except ServerDown:
            return ["FIRC err - " + OFFLINE]
        except Refused as e:
            return ["FIRC err - " + short(e)]

    def _part(self, sender, words):
        if len(words) != 5 or not RE_ID.match(words[2]):
            return ["FIRC err - Couldn't read that payment line. Send it again exactly as the wallet shows it."]
        pid, count, data = words[2], words[3], words[4]
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})", count)
        if not m:
            return [f"FIRC err {pid} Couldn't read the part number."]
        i, n = int(m.group(1)), int(m.group(2))
        if not (1 <= i <= n <= MAX_PARTS) or len(data) > PART or not RE_B64U.match(data):
            return [f"FIRC err {pid} That payment line is damaged. Send it again exactly as the wallet shows it."]
        self._forget_old()
        key = (sender, pid)
        p = self.pending.get(key)
        if p and p["n"] != n:
            del self.pending[key]
            return [f"FIRC err {pid} The parts don't match. Make the payment again in the wallet."]
        if not p:
            p = self.pending[key] = {"n": n, "parts": {}, "at": self.clock()}
        p["parts"][i] = data
        if len(p["parts"]) < n:
            return []
        del self.pending[key]
        raw = "".join(p["parts"][k] for k in range(1, n + 1))
        try:
            hexstr = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).hex()
        except ValueError:
            return [f"FIRC err {pid} That payment is damaged. Make it again in the wallet."]
        try:
            txid = self.server.broadcast(hexstr)
        except ServerDown:
            return [f"FIRC err {pid} " + OFFLINE]
        except Refused as e:
            return [f"FIRC err {pid} " + short(e)]
        return [f"FIRC ok {pid} {txid}"]

    def _forget_old(self):
        now = self.clock()
        for key in [k for k, p in self.pending.items() if now - p["at"] > PENDING_SECONDS]:
            del self.pending[key]
        while len(self.pending) >= MAX_PENDING:
            del self.pending[min(self.pending, key=lambda k: self.pending[k]["at"])]


def on_packet(packet, radio, gw, my_id, pause=3.0):
    """Meshtastic callback: answer on the same channel, or privately for a direct message."""
    sender = packet.get("fromId")
    if not sender or sender == my_id:
        return
    text = packet.get("decoded", {}).get("text", "")
    replies = gw.handle(sender, text)
    direct = packet.get("toId") == my_id
    for n, line in enumerate(replies):
        if n and pause:
            time.sleep(pause)  # give the radio time between messages
        line = line[:MAX_LINE]
        if direct:
            radio.sendText(line, destinationId=sender)
        else:
            radio.sendText(line, destinationId="^all", channelIndex=packet.get("channel", 0))
        print(f"  -> {line}", flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="FierCoin mesh gateway (Meshtastic radio <-> FierCoin server)")
    ap.add_argument("--server", default=DEFAULT_SERVER, help="FierCoin explorer address (default: %(default)s)")
    ap.add_argument("--port", help="radio's USB port, e.g. COM5 or /dev/ttyUSB0 (default: find it)")
    args = ap.parse_args(argv)
    try:
        import meshtastic.serial_interface
        from pubsub import pub
    except ImportError:
        print("The Meshtastic library is missing. Install it with:  pip install meshtastic")
        return 1
    gw = Gateway(Server(args.server))
    radio = meshtastic.serial_interface.SerialInterface(devPath=args.port)
    my_id = radio.getMyUser().get("id")
    print(f"FierCoin mesh gateway is running as {my_id}, using {args.server}")
    print("Leave this window open. Press Ctrl+C to stop.", flush=True)

    def received(packet, interface):
        print(f"<- {packet.get('fromId')}: {packet.get('decoded', {}).get('text', '')[:60]}", flush=True)
        try:
            on_packet(packet, interface, gw, my_id)
        except Exception as e:  # never let one bad message stop the gateway
            print("  problem:", e, flush=True)

    pub.subscribe(received, "meshtastic.receive.text")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        radio.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
