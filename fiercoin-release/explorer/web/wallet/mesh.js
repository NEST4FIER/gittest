// FierCoin over mesh radio: turns payments into short text lines for the Meshtastic app,
// and reads the gateway's replies. The format is in fiercoin-release/mesh-gateway/MESH-FORMAT.md.
// Plain JavaScript, no build step. In the wallet it's window.FIRCMesh.
(function (root) {
  'use strict';
  const MAX_LINE = 200, PART = 180, MAX_PARTS = 20;

  function hexToB64u(hex) {
    let bin = '';
    for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uToHex(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    let hex = '';
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  }
  function newId() {
    const a = new Uint8Array(4);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    return Array.from(a, (b) => (b % 36).toString(36)).join('');
  }

  function coinsRequest(address) { return 'FIRC U ' + address; }

  // Signed payment (hex) -> the lines to send, in order.
  function paymentLines(hex, id) {
    id = id || newId();
    const data = hexToB64u(hex), parts = [];
    for (let i = 0; i < data.length; i += PART) parts.push(data.slice(i, i + PART));
    if (parts.length > MAX_PARTS) throw new Error('This payment is too big for the mesh radio. Send a smaller amount, or fewer coins at once.');
    return parts.map((p, i) => `FIRC T ${id} ${i + 1}/${parts.length} ${p}`);
  }

  // Pasted text (any order, any extra chat) -> the coins for this address.
  function parseCoins(text, address) {
    const tag = address.slice(-6), got = new Map();
    let total = null, more = 0, none = false;
    const re = /FIRC u (\S{6}) (\d+)\/(\d+) ([^\r\n]*)/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== tag) continue;
      const i = +m[2], n = +m[3], rest = m[4].trim().split(/\s+/);
      if (rest[0] === 'none') { none = true; total = 1; got.set(1, []); continue; }
      total = n;
      const coins = [];
      for (const tok of rest) {
        if (/^\+\d+$/.test(tok)) { more = +tok.slice(1); continue; }
        const c = tok.split('.');
        if (c.length !== 3 || c[0].length !== 43) continue;
        coins.push({ txid: b64uToHex(c[0]), vout: parseInt(c[1], 36), value: parseInt(c[2], 36), mature: true });
      }
      got.set(i, coins);
    }
    const order = [...got.keys()].sort((a, b) => a - b);
    const utxos = [].concat(...order.map((k) => got.get(k)));
    return { utxos, have: got.size, total, more, none, complete: total !== null && got.size === total };
  }

  // Gateway answer for one payment id -> {ok, txid} / {ok:false, message} / null if not there.
  function parseResult(text, id) {
    const m = new RegExp('FIRC (ok|err) ' + id + ' ([^\\r\\n]*)').exec(text);
    if (!m) return null;
    return m[1] === 'ok' ? { ok: true, txid: m[2].trim() } : { ok: false, message: m[2].trim() };
  }

  const api = { MAX_LINE, coinsRequest, paymentLines, parseCoins, parseResult };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FIRCMesh = api;
})(typeof window !== 'undefined' ? window : globalThis);
